import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  check,
  index,
  unique,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  avatarStorageKey: text('avatar_storage_key'),
  role: varchar('role', { length: 20 }).notNull().default('member'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const teams = pgTable('teams', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const teamMembers = pgTable('team_members', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  role: varchar('role', { length: 50 }).notNull(),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
});

export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  ipAddress: varchar('ip_address', { length: 45 }),
});

export const invitations = pgTable('invitations', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  email: varchar('email', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  invitedBy: integer('invited_by')
    .notNull()
    .references(() => users.id),
  invitedAt: timestamp('invited_at').notNull().defaultNow(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
});

export const artifacts = pgTable('artifacts', {
  id: serial('id').primaryKey(),
  nookId: integer('nook_id').notNull().references(() => teams.id),
  creatorId: integer('creator_id').notNull().references(() => users.id),
  type: varchar('type', { length: 20 }).$type<'photo' | 'audio' | 'letter' | 'text' | 'other'>().notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  mediaStorageKey: text('media_storage_key'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  unique('artifacts_id_nook_unique').on(table.id, table.nookId),
  index('artifacts_nook_created_idx').on(table.nookId, table.createdAt, table.id),
  check('artifacts_type_check', sql`${table.type} IN ('photo', 'audio', 'letter', 'text', 'other')`),
  check('artifacts_title_check', sql`char_length(btrim(${table.title})) > 0`),
  check('artifacts_description_check', sql`${table.description} IS NULL OR char_length(${table.description}) <= 10000`),
  check('artifacts_media_key_check', sql`${table.mediaStorageKey} IS NULL OR (
    char_length(${table.mediaStorageKey}) BETWEEN 1 AND 1024
    AND ${table.mediaStorageKey} ~ '^[A-Za-z0-9][A-Za-z0-9_./-]*$'
    AND ${table.mediaStorageKey} !~ '(^|/)[.]{1,2}(/|$)'
    AND ${table.type} <> 'text'
  )`),
]);

export const contributions = pgTable('contributions', {
  id: serial('id').primaryKey(),
  artifactId: integer('artifact_id').notNull().references(() => artifacts.id),
  authorId: integer('author_id').notNull().references(() => users.id),
  type: varchar('type', { length: 20 }).$type<'text' | 'audio'>().notNull(),
  content: text('content'),
  audioStorageKey: text('audio_storage_key'),
  originalTranscript: text('original_transcript'),
  sourceLanguage: varchar('source_language', { length: 35 }),
  processingStatus: varchar('processing_status', { length: 20 })
    .$type<'draft' | 'pending' | 'processing' | 'completed' | 'failed'>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('contributions_artifact_created_idx').on(table.artifactId, table.createdAt, table.id),
  check('contributions_type_check', sql`${table.type} IN ('text', 'audio')`),
  check('contributions_content_check', sql`(
    ${table.type} = 'text' AND ${table.content} IS NOT NULL
    AND char_length(btrim(${table.content})) BETWEEN 1 AND 20000
    AND ${table.audioStorageKey} IS NULL AND ${table.originalTranscript} IS NULL
    AND ${table.sourceLanguage} IS NULL AND ${table.processingStatus} IS NULL
  ) OR (${table.type} = 'audio' AND ${table.content} IS NULL)`),
  check('contributions_audio_key_check', sql`${table.audioStorageKey} IS NULL OR (
    char_length(${table.audioStorageKey}) BETWEEN 1 AND 1024
    AND ${table.audioStorageKey} ~ '^[A-Za-z0-9][A-Za-z0-9_./-]*$'
    AND ${table.audioStorageKey} !~ '(^|/)[.]{1,2}(/|$)'
  )`),
  check('contributions_language_check', sql`${table.sourceLanguage} IS NULL OR ${table.sourceLanguage} ~ '^[A-Za-z]{2,3}([_-][A-Za-z0-9]{2,8})*$'`),
  check('contributions_status_check', sql`${table.processingStatus} IS NULL OR ${table.processingStatus} IN ('draft', 'pending', 'processing', 'completed', 'failed')`),
]);

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  nookId: integer('nook_id').notNull().references(() => teams.id),
  senderId: integer('sender_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  artifactId: integer('artifact_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  // PostgreSQL also enforces that a shared artifact belongs to this message's Nook.
  foreignKey({
    name: 'messages_artifact_nook_fk', columns: [table.artifactId, table.nookId],
    foreignColumns: [artifacts.id, artifacts.nookId]
  }),
  index('messages_nook_created_idx').on(table.nookId, table.createdAt, table.id),
  check('messages_content_check', sql`char_length(btrim(${table.content})) BETWEEN 1 AND 5000`),
]);

export const translations = pgTable('translations', {
  id: serial('id').primaryKey(),
  contributionId: integer('contribution_id').notNull().references(() => contributions.id),
  sourceLanguage: varchar('source_language', { length: 35 }).notNull(),
  targetLanguage: varchar('target_language', { length: 35 }).notNull(),
  translatedText: text('translated_text').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  unique('translations_contribution_languages_unique').on(table.contributionId, table.sourceLanguage, table.targetLanguage),
  check('translations_source_language_check', sql`${table.sourceLanguage} ~ '^[A-Za-z]{2,3}([_-][A-Za-z0-9]{2,8})*$'`),
  check('translations_target_language_check', sql`${table.targetLanguage} ~ '^[A-Za-z]{2,3}([_-][A-Za-z0-9]{2,8})*$'`),
  check('translations_text_check', sql`char_length(btrim(${table.translatedText})) > 0`),
]);

export const teamsRelations = relations(teams, ({ many }) => ({
  teamMembers: many(teamMembers),
  activityLogs: many(activityLogs),
  invitations: many(invitations),
  artifacts: many(artifacts),
  messages: many(messages),
}));

export const usersRelations = relations(users, ({ many }) => ({
  teamMembers: many(teamMembers),
  invitationsSent: many(invitations),
  artifacts: many(artifacts),
  contributions: many(contributions),
  messages: many(messages),
}));

export const artifactsRelations = relations(artifacts, ({ one, many }) => ({
  nook: one(teams, { fields: [artifacts.nookId], references: [teams.id] }),
  creator: one(users, { fields: [artifacts.creatorId], references: [users.id] }),
  contributions: many(contributions),
  messages: many(messages),
}));
export const contributionsRelations = relations(contributions, ({ one, many }) => ({
  artifact: one(artifacts, { fields: [contributions.artifactId], references: [artifacts.id] }),
  author: one(users, { fields: [contributions.authorId], references: [users.id] }),
  translations: many(translations),
}));
export const messagesRelations = relations(messages, ({ one }) => ({
  nook: one(teams, { fields: [messages.nookId], references: [teams.id] }),
  sender: one(users, { fields: [messages.senderId], references: [users.id] }),
  artifact: one(artifacts, { fields: [messages.artifactId, messages.nookId], references: [artifacts.id, artifacts.nookId] }),
}));
export const translationsRelations = relations(translations, ({ one }) => ({
  contribution: one(contributions, { fields: [translations.contributionId], references: [contributions.id] }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  team: one(teams, {
    fields: [invitations.teamId],
    references: [teams.id],
  }),
  invitedBy: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
  }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  team: one(teams, {
    fields: [activityLogs.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type TeamDataWithMembers = Team & {
  teamMembers: (TeamMember & {
    user: Pick<User, 'id' | 'name' | 'email'>;
  })[];
};

export enum ActivityType {
  SIGN_UP = 'SIGN_UP',
  SIGN_IN = 'SIGN_IN',
  SIGN_OUT = 'SIGN_OUT',
  UPDATE_PASSWORD = 'UPDATE_PASSWORD',
  DELETE_ACCOUNT = 'DELETE_ACCOUNT',
  UPDATE_ACCOUNT = 'UPDATE_ACCOUNT',
  CREATE_TEAM = 'CREATE_TEAM',
  REMOVE_TEAM_MEMBER = 'REMOVE_TEAM_MEMBER',
  INVITE_TEAM_MEMBER = 'INVITE_TEAM_MEMBER',
  ACCEPT_INVITATION = 'ACCEPT_INVITATION',
  CREATE_NOOK = 'CREATE_NOOK',
  UPDATE_NOOK = 'UPDATE_NOOK',
  INVITE_NOOK_MEMBER = 'INVITE_NOOK_MEMBER',
  ACCEPT_NOOK_INVITATION = 'ACCEPT_NOOK_INVITATION',
  REVOKE_NOOK_INVITATION = 'REVOKE_NOOK_INVITATION',
  UPDATE_NOOK_MEMBER = 'UPDATE_NOOK_MEMBER',
  REMOVE_NOOK_MEMBER = 'REMOVE_NOOK_MEMBER',
}
