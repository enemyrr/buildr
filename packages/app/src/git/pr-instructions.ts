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

export interface InstructionsRequestInput {
  client: ComposerSendClient;
  agentId: string;
  submission: MessageSubmissionWriter;
  queue: QueueWriter;
  isActive: () => boolean;
}

export function sendPrRequest(
  input: PrInstructionsContext & InstructionsRequestInput,
): Promise<"queued" | "sent"> {
  return sendInstructionsRequest(input, {
    file: { name: "PR instructions.md", instructions: buildPrInstructions(input) },
    text: `Create a ${input.draft ? "draft " : ""}PR for this workspace. Follow the attached PR instructions.md.`,
  });
}

export async function sendInstructionsRequest(
  input: InstructionsRequestInput,
  request: { text: string; file?: { name: string; instructions: string } },
): Promise<"queued" | "sent"> {
  const { file } = request;
  const attachments = file
    ? await uploadFileAttachments({
        client: input.client,
        files: [
          {
            fileName: file.name,
            mimeType: "text/markdown",
            readBytes: async () => new TextEncoder().encode(file.instructions),
          },
        ],
      })
    : [];
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

export function sendContinueRequest(
  input: { baseRef: string | null; prUrl: string | null } & InstructionsRequestInput,
): Promise<"queued" | "sent"> {
  const target = input.baseRef ?? "the repository's default branch";
  return sendInstructionsRequest(input, {
    text: `The PR for this workspace${input.prUrl ? ` (${input.prUrl})` : ""} was merged. Continue in this workspace: fetch the remote, create a new branch from the latest ${target}, carry over any uncommitted changes, and switch to it. Do not force-push or delete branches. Report the new branch name.`,
  });
}

export function sendFixChecksRequest(
  input: { prUrl: string | null } & InstructionsRequestInput,
): Promise<"queued" | "sent"> {
  return sendInstructionsRequest(input, {
    text: `CI checks are failing on the PR for this workspace${input.prUrl ? ` (${input.prUrl})` : ""}. Inspect the failing checks and their logs, fix the causes, run the relevant checks locally, then commit and push. Do not force-push.`,
  });
}

export function sendResolveConflictsRequest(
  input: { baseRef: string | null; prUrl: string | null } & InstructionsRequestInput,
): Promise<"queued" | "sent"> {
  const target = input.baseRef ?? "the PR's base branch";
  return sendInstructionsRequest(input, {
    text: `The PR for this workspace${input.prUrl ? ` (${input.prUrl})` : ""} has merge conflicts. Fetch the remote, merge the latest ${target} into this branch, resolve the conflicts preserving both sides' intent, run the relevant checks, then commit and push. Do not force-push.`,
  });
}
