/**
 * Contacts database — manages vendors/people in Supabase
 * that you want to stay connected with.
 */

import { supabase } from './supabaseClient.js';

/**
 * Load all contacts from Supabase.
 */
export async function loadContacts() {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .order('last_contacted', { ascending: true, nullsFirst: true });

  if (error) throw new Error(`Supabase error: ${error.message}`);
  return data || [];
}

/**
 * Add a new contact.
 * @param {{name: string, email?: string, company?: string, notes?: string}} contact
 */
export async function addContact(contact) {
  if (!contact.name) throw new Error('Contact name is required');

  const { data, error } = await supabase
    .from('contacts')
    .insert({
      name: contact.name,
      email: contact.email || null,
      company: contact.company || null,
      notes: contact.notes || null,
      last_contacted: null,
      habitica_task_id: null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to add contact: ${error.message}`);

  await logActivity(data.id, 'added', `Added ${data.name}${data.company ? ` (${data.company})` : ''}`);
  return data;
}

/**
 * Remove a contact by ID or email.
 * @param {string} identifier - UUID or email
 */
export async function removeContact(identifier) {
  // Try by ID first, then by email
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(identifier);
  const column = isUuid ? 'id' : 'email';

  const { data, error } = await supabase
    .from('contacts')
    .delete()
    .eq(column, isUuid ? identifier : identifier.toLowerCase())
    .select()
    .single();

  if (error) throw new Error(`No contact found: ${error.message}`);

  await logActivity(data.id, 'removed', `Removed ${data.name}${data.company ? ` (${data.company})` : ''}`);
  return data;
}

/**
 * Mark a contact as contacted today (by ID or email).
 * Clears the associated Habitica task ID since it's done.
 * @param {string} identifier - UUID or email
 * @param {string} [date] - YYYY-MM-DD, defaults to today
 */
export async function markContacted(identifier, date) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(identifier);
  const column = isUuid ? 'id' : 'email';
  const dateStr = date || new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('contacts')
    .update({ last_contacted: dateStr, habitica_task_id: null })
    .eq(column, isUuid ? identifier : identifier.toLowerCase())
    .select()
    .single();

  if (error) return null;

  await logActivity(data.id, 'contacted', `Marked ${data.name} as contacted on ${dateStr}`);
  return data;
}

/**
 * Store the Habitica task ID on a contact so we can check completion later.
 * @param {string} contactId - UUID
 * @param {string} habiticaTaskId
 */
export async function setHabiticaTaskId(contactId, habiticaTaskId) {
  const { error } = await supabase
    .from('contacts')
    .update({ habitica_task_id: habiticaTaskId })
    .eq('id', contactId);

  if (error) throw new Error(`Failed to update Habitica task ID: ${error.message}`);

  if (habiticaTaskId) {
    await logActivity(contactId, 'task_created', 'Reconnect task created in Habitica');
  }
}

/**
 * Find the contact you haven't reached out to the longest.
 * Contacts with null last_contacted are prioritized (never contacted).
 * Skips contacts that already have a pending Habitica task.
 */
export async function findLeastRecentlyContacted() {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .is('habitica_task_id', null)
    .order('last_contacted', { ascending: true, nullsFirst: true })
    .limit(1)
    .single();

  if (error) return null;
  return data;
}

/**
 * Get all contacts that have a pending Habitica task.
 */
export async function getContactsWithPendingTasks() {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .not('habitica_task_id', 'is', null);

  if (error) return [];
  return data || [];
}

/**
 * Log an activity event for a contact.
 * @param {string} contactId - UUID
 * @param {string} action - e.g. 'added', 'removed', 'contacted', 'edited', 'task_created', 'task_completed'
 * @param {string} [details] - human-readable description
 */
export async function logActivity(contactId, action, details) {
  await supabase.from('contact_activity').insert({
    contact_id: contactId,
    action,
    details: details || null,
  });
}

/**
 * Get activity log, optionally filtered by contact.
 * @param {string} [contactId] - UUID to filter by, or omit for all activity
 * @param {number} [limit] - max rows (default 30)
 */
export async function getActivity(contactId, limit = 30) {
  let query = supabase
    .from('contact_activity')
    .select('*, contacts(name, company)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (contactId) {
    query = query.eq('contact_id', contactId);
  }

  const { data, error } = await query;
  if (error) return [];
  return data || [];
}

/**
 * List all contacts sorted by last_contacted (oldest first, never-contacted at top).
 */
export async function listContacts() {
  return loadContacts();
}
