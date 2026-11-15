const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function loader(overrides = {}) {
  const cache = new Map();
  function load(name) {
    if (Object.hasOwn(overrides, name)) return overrides[name];
    if (!name.startsWith('@/')) return require(name);
    if (cache.has(name)) return cache.get(name).exports;
    const stem = path.resolve(__dirname, '..', name.slice(2));
    const file = fs.existsSync(`${stem}.ts`) ? `${stem}.ts` : `${stem}.tsx`;
    const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const module = { exports: {} }; cache.set(name, module);
    const requireFromFile = (child) => load(child.startsWith('.') ? '@/' + path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), child)).split(path.sep).join('/') : child);
    new Function('require', 'module', 'exports', js)(requireFromFile, module, module.exports);
    return module.exports;
  }
  return load;
}

const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
const nook={id:42,name:'Our actual Nook',description:'Shared stories',role:'member',createdAt:'2026-01-01',updatedAt:'2026-01-01'};
const member={id:91,nookId:42,userId:6,role:'member',joinedAt:'2026-01-01',user:{id:6,name:'An Actual Reader',email:'PRIVATE_EMAIL@example.com'}};
const message={id:1,nookId:42,senderId:6,content:'Hello\nour people',artifactId:null,createdAt:'2026-01-01T00:00:00Z'};

test('numeric routing, member grammar, sender identities and chronological deduplication use real IDs',()=>{
 const api=loader()('@/lib/frontend/real-messages');
 for(const [count,label]of [[0,'0 members'],[1,'1 member'],[2,'2 members']])assert.equal(api.memberCountLabel(count),label);
 assert.equal(api.conversationHref(42),'/messages/42');assert.throws(()=>api.conversationHref('rivera-family'));assert.throws(()=>api.conversationHref(0));
 assert.equal(api.senderName(message,5,[member]),'An Actual Reader');assert.equal(api.senderName(message,6,[member]),'You');
 assert.equal(api.senderName(message,5,[]),'Former member');assert.equal(api.senderName(message,5,[{...member,user:{...member.user,name:null}}]),'Nook member');
 assert.equal(api.senderName(message,5,[{...member,nookId:99}]),'Former member');
 const list=api.orderedMessages([{...message,id:2,createdAt:'2026-01-02'},message,message,{...message,id:3,nookId:99}],42);
 assert.deepEqual(list.map(m=>m.id),[1,2]);
});

test('text adapter trims, uses authenticated POST and requires a 201 numeric matching response',async()=>{
 const original=global.fetch;const api=loader()('@/lib/frontend/real-messages');const calls=[];
 global.fetch=async(url,options)=>{calls.push({url,...options});return Response.json({message:{...message,content:JSON.parse(options.body).content,artifactId:JSON.parse(options.body).artifactId??null}},{status:201});};
 try{
  await api.sendNookMessage(42,{content:'  A story\nwith a second line  '});
  assert.equal(calls[0].url,'/api/nooks/42/messages');assert.equal(calls[0].credentials,'same-origin');
  assert.deepEqual(JSON.parse(calls[0].body),{content:'A story\nwith a second line'});
  for(const content of ['','   ','a'.repeat(5001)])await assert.rejects(api.sendNookMessage(42,{content}));
  await assert.rejects(api.sendNookMessage(42,{content:'Hi',senderId:999}));await assert.rejects(api.sendNookMessage('rivera-family',{content:'Hi'}));assert.equal(calls.length,1);
  await api.sendNookMessage(42,{content:'a'.repeat(5000)});
  for(const [status,body]of [[200,{message}],[201,{message:{...message,id:'1'}}],[201,{message:{...message,nookId:99}}],[401,{}],[403,{}],[404,{}],[400,{}],[500,{}]]){
   global.fetch=async()=>Response.json(body,{status});await assert.rejects(api.sendNookMessage(42,{content:'Hi'}),error=>error.status===status);
  }
  global.fetch=async()=>{throw new Error('Lost');};await assert.rejects(api.sendNookMessage(42,{content:'Hi'}),error=>error.uncertain);
 }finally{global.fetch=original;}
});

function composerHarness(send,onConfirmed=async()=>{}){
 const slots=[];let cursor=0;const cleanup=[];
 const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect(effect){const i=cursor++;if(!(i in slots)){slots[i]=true;cleanup.push(effect());}}};
 const api=loader()('@/lib/frontend/real-messages');
 const hook=loader({react,'@/lib/frontend/real-messages':{...api,sendNookMessage:send}})('@/components/solibra/use-message-composer').useMessageComposer;
 return{render(){cursor=0;return hook(42,5,onConfirmed);},unmount(){cleanup.forEach(fn=>fn?.());},api};
}

test('composer clears only after acknowledgment, prevents repeats and refreshes once',async()=>{
 let done;let sends=0;let refreshes=0;
 const h=composerHarness(async()=>{sends++;return new Promise(resolve=>done=resolve);},async saved=>{assert.equal(saved.id,8);refreshes++;});
 h.render().setDraft('My multiline\nmessage');const first=h.render().send();await h.render().send();assert.equal(sends,1);assert.equal(h.render().draft,'My multiline\nmessage');assert.equal(h.render().pending,true);
 done({message:{...message,id:8,senderId:5}});await first;
 assert.equal(h.render().draft,'');assert.equal(h.render().pending,false);assert.equal(refreshes,1);assert.equal(h.render().notice,'Message saved.');h.unmount();
});

test('failed or unknown sends retain drafts and never retry automatically; history failure after save does not encourage resending',async()=>{
 const api=loader()('@/lib/frontend/real-messages');let calls=0;
 const h=composerHarness(async()=>{calls++;throw new api.MessageSendError(0,'Unknown result',true);});
 h.render().setDraft('Retain me');await h.render().send();assert.equal(h.render().draft,'Retain me');assert.equal(calls,1);assert.ok(h.render().error.uncertain);
 await h.render().send();assert.equal(calls,1);assert.equal(h.render().needsRefresh,true);h.render().confirmRetryAfterInspection();h.render().setDraft(' '.repeat(4));await h.render().send();assert.equal(calls,1);assert.equal(h.render().error.status,400);h.unmount();
 const saved=composerHarness(async()=>({message:{...message,senderId:5}}),async()=>{throw new Error('Offline');});saved.render().setDraft('Saved');await saved.render().send();assert.equal(saved.render().draft,'');assert.match(saved.render().notice,/don’t resend/);saved.unmount();
});

function conversationLoader(responses,api){return loader({
 ...(api?{'@/lib/frontend/nook-api':api}:{}),
 '@/components/solibra/use-nook-data':{useNookData:(url,viewerId)=>{assert.equal(viewerId,5);return responses[url]||{};}},
 '@/components/solibra/use-conversation-viewport':{useConversationViewport(){}},
 '@/components/solibra/use-message-composer':{useMessageComposer:()=>({draft:'',pending:false,error:null,notice:''})}
});}
function resources(messages=[]){return{
 '/api/nooks/42':{data:{nook}},'/api/nooks':{data:{nooks:[nook,{...nook,id:43,name:'Another Nook'}]}},
 '/api/nooks/42/members':{data:{members:[member]}},'/api/nooks/42/messages':{data:{messages}},
 '/api/nooks/42/artifacts':{data:{artifacts:[{id:7,nookId:42,title:'A real artifact'},{id:8,nookId:99,title:'WRONG_NOOK'}]}}
};}

test('real rendering supports empty/populated conversations, actual senders and same-Nook links without cross-Nook memory destinations',()=>{
 for(const messages of [[],[message,{...message,id:2,senderId:5,artifactId:7},{...message,id:3,senderId:99,artifactId:8}]]){
  const Component=conversationLoader(resources(messages))('@/components/solibra/real-conversation').RealConversation;
  const html=renderToStaticMarkup(React.createElement(Component,{nookId:42,viewerId:5}));
  assert.ok(html.includes('/messages/43'));assert.ok(html.includes('Our actual Nook'));assert.ok(html.includes('1 member'));assert.ok(!html.includes('PRIVATE_EMAIL'));assert.ok(!html.includes('Sofía'));assert.ok(!html.includes('Elena'));assert.ok(!html.includes('WRONG_NOOK'));if(messages.length)assert.ok(html.includes('/circles/42/memories/7'));assert.ok(!html.includes('/memories/8'));
  if(messages.length){assert.ok(html.includes('An Actual Reader'));assert.ok(html.includes('You'));assert.ok(html.includes('Former member'));assert.ok(html.includes('A real artifact'));}else assert.ok(html.includes('first message'));
 }
});

test('revoked or unsigned read failures suppress all cached messages',()=>{
 for(const status of [401,403,404]){
  const api=loader()('@/lib/frontend/nook-api');const data=resources([{...message,content:'PRIVATE_CACHED_MESSAGE'}]);data['/api/nooks/42/messages'].error=new api.NookRequestError(status,`Blocked ${status}`);
  const Component=conversationLoader(data,api)('@/components/solibra/real-conversation').RealConversation;
  const html=renderToStaticMarkup(React.createElement(Component,{nookId:42,viewerId:5}));assert.ok(!html.includes('PRIVATE_CACHED_MESSAGE'));assert.ok(!html.includes('Group message composer'));
 }
});

test('selector handles zero, one and multiple real Nooks with numeric conversation destinations',()=>{
 for(const nooks of [[],[nook],[nook,{...nook,id:43,name:'Second Nook'}]]){
  const Selector=loader({'@/components/solibra/use-nook-data':{useNookData:()=>({data:{nooks}})}})('@/components/solibra/message-nook-selector').MessageNookSelector;
  const html=renderToStaticMarkup(React.createElement(Selector,{viewerId:5}));
  if(nooks.length){assert.ok(html.includes('/messages/42'));assert.ok(!html.includes('rivera-family'));}else assert.ok(html.includes('don’t have any Nooks'));
 }
});

test('numeric and demo routes remain separate; account changes remount scoped conversation state',async()=>{
 let viewer=5;let verified=0;
 const route=loader({
  'next/navigation':{notFound(){throw new Error('Not found');}},
  '@/lib/auth/require-profile-user':{requireProfileUser:async()=>{verified++;return{id:viewer};}},
  '@/components/solibra/real-conversation':{RealConversation:()=>null},'@/components/solibra/messages':{FamilyMessages:()=>null}
 })('@/app/(library)/messages/[circleId]/page').default;
 const load=id=>route({params:Promise.resolve({circleId:id}),searchParams:Promise.resolve({})});
 const first=await load('42');assert.equal(first.props.nookId,42);assert.equal(first.props.viewerId,5);viewer=6;const next=await load('42');assert.notEqual(first.key,next.key);
 const demo=await load('rivera-family');assert.match(demo.props.circle.title,/Demo/);assert.equal(verified,2);
 for(const invalid of ['0','-1','001','bogus'])await assert.rejects(load(invalid),/Not found/);
});

test('late send completion after unmount cannot update another conversation or account cache',async()=>{
 let resolve;let updates=0;
 const h=composerHarness(()=>new Promise(done=>resolve=done),async()=>updates++);
 h.render().setDraft('Private draft');const send=h.render().send();h.unmount();resolve({message:{...message,senderId:5}});await send;assert.equal(updates,0);
});

test('memory requests preserve the actual artifact reference and avoid duplicate writes on pending or unknown sends',async()=>{
 let release,calls=0;const sent=[];
 const h=composerHarness(async(n,input)=>{calls++;sent.push({n,input});return new Promise(resolve=>release=resolve);});
 h.render().setDraft('Does anyone remember this afternoon?');h.render().setLinkedArtifactId(7);
 const first=h.render().send();await h.render().send();assert.equal(calls,1);assert.deepEqual(sent[0],{n:42,input:{content:'Does anyone remember this afternoon?',artifactId:7}});
 release({message:{...message,senderId:5,artifactId:7}});await first;assert.equal(h.render().linkedArtifactId,null);assert.equal(h.render().draft,'');h.unmount();
 const api=loader()('@/lib/frontend/real-messages');let attempts=0;const unknown=composerHarness(async()=>{attempts++;throw new api.MessageSendError(0,'Unknown',true);});
 unknown.render().setDraft('I added my voice to this memory.');unknown.render().setLinkedArtifactId(7);await unknown.render().send();await unknown.render().send();assert.equal(attempts,1);assert.equal(unknown.render().linkedArtifactId,7);assert.equal(unknown.render().needsRefresh,true);unknown.render().clearError();assert.ok(unknown.render().error.uncertain);unknown.unmount();
});

test('request picker loads only this Nook, sends its selected artifact and renders a numeric memory link',async()=>{
 const slots=[];let cursor=0;const paths=[];const sent=[];
 const react={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect(){cursor++;}};
 const data=resources();for(const value of Object.values(data))value.mutate=async next=>{if(next)value.data=typeof next==='function'?next(value.data):next;return value.data;};
 const base=loader()('@/lib/frontend/real-messages');const load=loader({react,'@/components/solibra/use-nook-data':{useNookData:(path,id)=>{assert.equal(id,5);paths.push(path);return data[path]||{};}},'@/components/solibra/use-conversation-viewport':{useConversationViewport(){}},'@/lib/frontend/real-messages':{...base,sendNookMessage:async(n,input)=>{sent.push({n,input});return{message:{...message,id:25,senderId:5,content:input.content,artifactId:input.artifactId}};}}});
 const Component=load('@/components/solibra/real-conversation').RealConversation;const render=()=>{cursor=0;return Component({nookId:42,viewerId:5});};
 function nodes(tree,predicate,out=[]){if(!tree||typeof tree!=='object')return out;if(Array.isArray(tree)){tree.forEach(n=>nodes(n,predicate,out));return out;}if(predicate(tree))out.push(tree);nodes(tree.props?.children,predicate,out);return out;}
 nodes(render(),n=>n.type==='button'&&n.props.children==='Request a memory')[0].props.onClick();let tree=render();assert.ok(paths.includes('/api/nooks/42/artifacts'));
 const select=nodes(tree,n=>n.type==='select')[0];assert.ok(nodes(select,n=>n.type==='option'&&n.props.value===7).length);assert.equal(nodes(select,n=>n.type==='option'&&n.props.value===8).length,0);
 select.props.onChange({target:{value:'7'}});tree=render();nodes(tree,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(sent.length,1);assert.equal(sent[0].n,42);assert.equal(sent[0].input.artifactId,7);assert.ok(sent[0].input.content.includes('A real artifact'));assert.ok(nodes(render(),n=>n.props?.href==='/circles/42/memories/7').length);assert.ok(!paths.some(path=>path?.includes('/99/')));
});
