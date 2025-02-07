const { createVersionText } = require('./helpers');

module.exports = async ({ github, context, core }) => {
  const commentBody = createVersionText('PR Next Release', process.env.CURRENT_VERSION, context);

  await github.rest.issues.createComment({
    issue_number: context.issue.number,
    owner: context.repo.owner,
    repo: context.repo.repo,
    body: commentBody,
  });

  await github.rest.checks.update({
    owner: context.repo.owner,
    repo: context.repo.repo,
    status: 'completed',
    completed_at: new Date(),
    conclusion: 'success',
    check_run_id: process.env.CHECK_RUN_ID,
    output: {
      title: 'PR Next Version publish successful!',
      summary: `A version for pull request is **published**. version: **${process.env.CURRENT_VERSION}**`,
    },
  });
};
