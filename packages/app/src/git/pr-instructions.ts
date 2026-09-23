import type { ComposerAttachment } from "@/attachments/types";
import {
  dispatchComposerAgentMessage,
  uploadFileAttachments,
  queueComposerMessage,
  type QueueWriter,
  type ComposerSendClient,
  type MessageSubmissionWriter,
} from "@/composer/actions";

export interface PrInstructionsContext {
  branch: string | null;
  baseRef: string | null;
  draft: boolean;
}

export function buildPrInstructions({ branch, baseRef, draft }: PrInstructionsContext): string {
  return `# PR instructions

The user requested a ${draft ? "draft " : ""}pull request for the current workspace.
Current branch: ${branch ?? "determine with git branch --show-current"}.
Target branch: ${baseRef ?? "determine the repository's default branch"}.

Follow the repository instructions and any PR-related skills.

1. Run git status and review the full diff, including uncommitted changes. Preserve unrelated user changes.
2. Run the relevant checks, then commit the changes for this PR. If on the target branch, create a feature branch first.
3. Push to the correct remote and head branch. For a fork, use the fork as the head and the intended upstream repository as the base. Do not force-push.
4. Review all changes between the target branch and HEAD, not only the latest commit.
5. Create the ${draft ? "draft " : ""}PR with the repository's forge CLI. On GitHub, use gh pr create${draft ? " --draft" : ""} with the correct --base. Keep the title under 80 characters and the description under five sentences unless the repository template requires more. Describe all changes and their validation.
6. Return the PR URL. If a step fails, report the blocker instead of claiming success.
`;
}

/** A git request: a short visible message, with the full instructions as a markdown attachment. */
export interface InstructionsRequest {
  text: string;
  file?: { name: string; instructions: string };
}

export interface InstructionsRequestInput {
  client: ComposerSendClient;
  agentId: string;
  submission: MessageSubmissionWriter;
  queue: QueueWriter;
  isActive: () => boolean;
}

export function buildPrRequest(context: PrInstructionsContext): InstructionsRequest {
  return {
    text: context.draft ? "Create a draft PR" : "Create a PR",
    file: { name: "PR instructions.md", instructions: buildPrInstructions(context) },
  };
}

export async function uploadInstructionsAttachments(
  client: ComposerSendClient,
  request: InstructionsRequest,
): Promise<ComposerAttachment[]> {
  const { file } = request;
  if (!file) return [];
  return uploadFileAttachments({
    client,
    files: [
      {
        fileName: file.name,
        mimeType: "text/markdown",
        readBytes: async () => new TextEncoder().encode(file.instructions),
      },
    ],
  });
}

/** Sends to a running agent, queueing behind its current turn. */
export async function sendInstructionsRequest(
  input: InstructionsRequestInput,
  request: InstructionsRequest,
): Promise<"queued" | "sent"> {
  const attachments = await uploadInstructionsAttachments(input.client, request);
  if (input.isActive()) {
    queueComposerMessage({
      agentId: input.agentId,
      text: request.text,
      attachments,
      queue: input.queue,
    });
    return "queued";
  }
  await dispatchComposerAgentMessage({
    client: input.client,
    agentId: input.agentId,
    submission: input.submission,
    text: request.text,
    attachments,
    encodeImages: async () => undefined,
  });
  return "sent";
}

function prReference(prUrl: string | null): string {
  return prUrl ? ` (${prUrl})` : "";
}

export function buildContinueRequest(input: {
  baseRef: string | null;
  prUrl: string | null;
}): InstructionsRequest {
  const target = input.baseRef ?? "the repository's default branch";
  return {
    text: "Continue on a new branch",
    file: {
      name: "Continue instructions.md",
      instructions: `# Continue instructions

The PR for this workspace${prReference(input.prUrl)} was merged. Continue in this workspace: fetch the remote, create a new branch from the latest ${target}, carry over any uncommitted changes, and switch to it. Do not force-push or delete branches. Report the new branch name.
`,
    },
  };
}

export function buildFixChecksRequest(input: { prUrl: string | null }): InstructionsRequest {
  return {
    text: "Fix failing checks",
    file: {
      name: "Fix checks instructions.md",
      instructions: `# Fix checks instructions

CI checks are failing on the PR for this workspace${prReference(input.prUrl)}. Inspect the failing checks and their logs, fix the causes, run the relevant checks locally, then commit and push. Do not force-push.
`,
    },
  };
}

export function buildResolveConflictsRequest(input: {
  baseRef: string | null;
  prUrl: string | null;
}): InstructionsRequest {
  const target = input.baseRef ?? "the PR's base branch";
  return {
    text: "Resolve merge conflicts",
    file: {
      name: "Conflict instructions.md",
      instructions: `# Conflict instructions

The PR for this workspace${prReference(input.prUrl)} has merge conflicts. Fetch the remote, merge the latest ${target} into this branch, resolve the conflicts preserving both sides' intent, run the relevant checks, then commit and push. Do not force-push.
`,
    },
  };
}

export function buildCommitAndPushRequest(): InstructionsRequest {
  return {
    text: "Commit and push",
    file: {
      name: "Commit instructions.md",
      instructions: `# Commit instructions

Commit and push the changes in this workspace. Review git status and the full diff, and preserve unrelated user changes. Run the relevant checks, commit with a concise message that describes the change, then push the branch to its remote. Do not force-push. Report the commit and branch.
`,
    },
  };
}
