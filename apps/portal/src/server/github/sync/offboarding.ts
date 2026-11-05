import { githubAccounts, githubIssueParticipants, githubIssues, githubRepositories, githubUserTokens } from '@schema';
import { and, db, desc, eq } from 'void/db';
import { registerOffboardingStep } from '../../offboarding';

registerOffboardingStep({
  key: 'github',
  label: 'GitHub account link and stored token removed',
  async plan({ person }) {
    const [account] = await db.select({ githubUserId: githubAccounts.githubUserId }).from(githubAccounts).where(eq(githubAccounts.personId, person.id));
    if (!account) return { count: 0, needsSuccessor: false, statements: [] };
    const open = await db
      .select({ id: githubIssues.id, number: githubIssues.number, title: githubIssues.title, fullName: githubRepositories.fullName })
      .from(githubIssueParticipants)
      .innerJoin(githubIssues, eq(githubIssues.id, githubIssueParticipants.issueId))
      .innerJoin(githubRepositories, eq(githubRepositories.id, githubIssues.repositoryId))
      .where(and(eq(githubIssueParticipants.githubUserId, account.githubUserId), eq(githubIssueParticipants.role, 'assignee'), eq(githubIssues.state, 'open')))
      .orderBy(desc(githubIssues.githubUpdatedAt))
      .limit(50);
    return {
      count: 1,
      needsSuccessor: false,
      statements: [
        db.delete(githubUserTokens).where(eq(githubUserTokens.personId, person.id)),
        db.delete(githubAccounts).where(eq(githubAccounts.personId, person.id)),
      ],
      items: open.map((item) => ({ id: item.id, label: `${item.fullName}#${item.number} ${item.title}` })),
    };
  },
});
