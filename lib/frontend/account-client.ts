export async function fetchAccountData<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error(response.status === 401 ? 'Please sign in to view your account.' : 'Unable to load this information. Please try again.');
  return response.json();
}
