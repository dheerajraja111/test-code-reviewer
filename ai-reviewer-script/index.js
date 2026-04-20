import * as core from '@actions/core';
import * as github from '@actions/github';
import { GoogleGenerativeAI } from '@google/generative-ai';

async function run() {
  try {
    // Fetching Secrets and Tokens
    const githubToken = core.getInput('GITHUB_TOKEN');
    const geminiKey = core.getInput('GEMINI_API_KEY');

    const octokit = github.getOctokit(githubToken);
    const context = github.context;

    console.log('octokit: ', octokit);
    console.log('context: ', context);

    // only if PR is raised
    if (context.payload.pull_request == null) {
      core.setFailed('No pull request found.');
      return;
    }

    console.log('payload: ', context.payload);
    console.log('repo: ', context.repo);
    const prNumber = context.payload.pull_request.number;
    console.log('PR Number: ', prNumber);

    // Getting the difference inside PR (changed code)

    const { data: diff } = await octokit.rest.pulls.get({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: prNumber,
      mediaType: {
        format: 'diff', // Yeh parameter bataata hai ki hume pure files nahi, sirf changes chahiye
      },
    });

    if (diff.length > 100000) {
      core.info('PR is too large for AI review. Skipping.');
      return;
    }

    // Setting up Gemini
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
      You are a strict and senior enterprise software engineer. 
      Review the following git diff of a pull request.
      Look for: Security vulnerabilities, performance bottlenecks, logic errors, Accessibility (a11y) issues and bad coding practices.
      Do not comment on minor stylistic issues.
      Provide your feedback in a clean Markdown format with actionable suggestions.      
      Code Diff:
      ${diff}
    `;

    // Get the review
    const result = await model.generateContent(prompt);
    const reviewComment = result.response.text();

    await octokit.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: prNumber,
      body: `### AI Code Review\n\n${reviewComment}`,
    });

    core.info('Successfully posted AI review on PR!');
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}
