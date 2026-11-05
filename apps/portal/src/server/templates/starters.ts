import type { Definition } from './validation';

const starters = [
  ['ngo', 'Introduction to NGO', 'Exploring how our consulting team can support {{organization}}.', 'outreach'],
  ['partnership', 'Partnership request', 'We would like to explore a partnership with {{organization}}.', 'outreach'],
  ['meeting', 'Meeting proposal', 'Could we meet on {{date}} to discuss {{topic}}?', 'correspondence'],
  ['update', 'Consulting update', 'Here is our progress on {{topic}} for {{organization}}.', 'correspondence'],
  ['handover', 'Deliverable handover', 'Please find the deliverable for {{topic}} attached for your review.', 'correspondence'],
  ['event', 'Event collaboration', 'We invite {{organization}} to collaborate on {{topic}}.', 'outreach'],
  ['sponsorship', 'Sponsorship request', 'We would like to discuss sponsorship of {{topic}} with {{organization}}.', 'outreach'],
  ['letter', 'Official letter attachment', 'Please find the official letter regarding {{topic}} attached.', 'correspondence'],
  ['invitation', 'Invitation', 'You are invited to {{topic}} on {{date}}.', 'correspondence'],
  ['promotion', 'Promotion', 'Congratulations on your appointment as {{topic}}.', 'correspondence'],
  ['role_handover', 'Role handover', 'This is the handover for {{topic}}. Please review the attached record.', 'correspondence'],
] as const;
/** These are authoring recipes, not published templates or permission grants. */
export function starterDefinitions(mailboxId: string) {
  return starters.map(([id, name, body, category]) => {
    const source = `${name}: {{topic}}\n${body}`;
    const fields: Definition['fields'] = [
      { key: 'topic', label: 'Topic / role', type: 'short', required: true, example: 'Project launch', options: [] },
    ];
    if (source.includes('{{organization}}')) fields.push({ key: 'organization', label: 'Organisation', type: 'organization', required: true, example: 'Select a CRM organisation', options: [] });
    if (source.includes('{{date}}')) fields.push({ key: 'date', label: 'Date', type: 'date', required: true, example: '2026-11-01', options: [] });
    if (['handover', 'letter', 'role_handover'].includes(id)) fields.push({ key: 'document', label: 'Approved document', type: 'attachment', required: true, example: 'Upload a saved Letter Studio PDF or deliverable', options: [] });
    return { id, name, definition: {
      fields, subject: `${name}: {{topic}}`, body: `Dear team,\n\n${body}\n\n{{member_name}}\n{{member_position}}`,
      signature: '{{club_name}}\n{{club_website}}', allowedMailboxIds: [mailboxId], allowedRecipients: [],
      category, policy: {}, followupDays: null,
    } satisfies Definition };
  });
}
