import { DefaultAzureCredential } from "@azure/identity";
import { AIProjectClient } from "@azure/ai-projects";
import { stdin as input, stderr as output } from 'node:process';
import OpenAI from "openai";
import { Stream } from "openai/core/streaming";
import readline from 'readline/promises';

import { loadEnvFile } from "node:process"
import { ResponseCreateParamsBase, ResponseCreateParamsNonStreaming, ResponseCreateParamsStreaming, ResponseInput } from "openai/resources/responses/responses";
loadEnvFile('./.env');

const rl = readline.createInterface({ input, output });
const projectEndpoint = process.env.PROJECT_ENDPOINT || "";
const conversationId = process.env.CONVERSATION_ID || "";
const agentName = process.env.AGENT_NAME || "";
const isStream = process.env.ENABLE_STREAM_RESPONSE === "true";
const enableMcpToolAutoApproval = process.env.ENABLE_MCPTOOL_AUTO_APPROVAL === "true";

async function main(): Promise<void> {
  const credential = new DefaultAzureCredential();
  const projectClient = new AIProjectClient(projectEndpoint, credential);

  const agent = await projectClient.agents.get(agentName);
  const openAIClient = await projectClient.getOpenAIClient();
  const conversation = conversationId ? await openAIClient.conversations.retrieve(conversationId) : await openAIClient.conversations.create();

  const extraBody = {
    body: { agent: { name: agent.name, type: "agent_reference" } },
  }

  let response: OpenAI.Responses.Response | undefined = undefined;
  const approvalRequestedTools: OpenAI.Responses.ResponseOutputItem.McpApprovalRequest[] = [];
  console.warn("You can start chatting with the agent now.");
  while (true) {
    let input: string | ResponseInput;
    if (approvalRequestedTools.length > 0) {
      console.warn("The agent is requesting approval for the following tools:");
      for (const tool of approvalRequestedTools) {
        console.warn(`  - Server: ${tool.server_label}`);
        console.warn(`    Tool: ${tool.name}`);
      }
      enableMcpToolAutoApproval && console.warn("  Auto-approving tools as per configuration.");
      const approvalInput = enableMcpToolAutoApproval ? "y" : await rl.question("\n  Do you approve the use of these tools? [Y/n]: ");

      const isApproved = ['yes', 'y', ''].includes(approvalInput.trim().toLowerCase());
      input = approvalRequestedTools.map(tool => ({
        type: "mcp_approval_response",
        approval_request_id: tool.id,
        approve: isApproved,
      })) as ResponseInput;
    } else {
      input = await rl.question("\n[You]: ");
    }
    if (typeof input === "string" && input.trim() === "") continue;

    const streamResponse = async (body: ResponseCreateParamsStreaming): Promise<OpenAI.Responses.Response> => {
      const stream: Stream<OpenAI.Responses.ResponseStreamEvent> = await openAIClient.responses.create(body, extraBody);
      let isFirstChunk = true;

      for await (const event of stream) {
        // Handle different event types
        // console.debug(event.type);
        if (event.type === "response.created") {
        } else if (event.type === "response.output_text.delta") {
          // Print delta text as it arrives (without newlines to show streaming effect)
          if (isFirstChunk) {
            process.stderr.write(`[${agent.name}]: `);
            isFirstChunk = false;
          }
          process.stdout.write(event.delta);
        } else if (event.type === "response.output_text.done") {
          // console.log(`\n\nResponse done with full text: ${event.text}`);
        } else if (event.type === "response.completed") {
          return event.response;
        }
      }
      throw new Error("Stream ended without receiving a 'response.completed' event.");
    };

    const body: ResponseCreateParamsBase = {
      conversation: response ? undefined : conversation.id,
      input,
      previous_response_id: response ? response.id : undefined,
      stream: isStream,
    };
    response = isStream
      ? await streamResponse(body as ResponseCreateParamsStreaming)
      : await openAIClient.responses.create(body as ResponseCreateParamsNonStreaming, extraBody);
      
    !isStream && console.log(`[${agent.name}]: ${response.output_text}`);
    approvalRequestedTools.length = 0; // Clear previous requests
    approvalRequestedTools.push(...response.output.filter(o => o.type === 'mcp_approval_request'));
  }
}

main().catch((error) => {
  if (error.message.includes("Ctrl+C")) return; // Ignore Ctrl+C errors
  console.error("An error occurred:", error);
});