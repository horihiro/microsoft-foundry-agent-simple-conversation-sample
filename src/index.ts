import { DefaultAzureCredential } from "@azure/identity";
import { AIProjectClient } from "@azure/ai-projects";
import { stdin as input, stderr as output } from 'node:process';
import OpenAI from "openai";
import { Stream } from "openai/core/streaming";
import readline from 'readline/promises';

import { loadEnvFile } from "node:process"
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

  let response: OpenAI.Responses.Response | Stream<OpenAI.Responses.ResponseStreamEvent> | undefined = undefined;
  const approvalRequestedTools: OpenAI.Responses.ResponseOutputItem.McpApprovalRequest[] = [];
  console.warn("You can start chatting with the agent now.");
  while (true) {
    let input: string | OpenAI.Responses.ResponseInputItem.McpApprovalResponse[];
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
      }));
    } else {
      input = await rl.question("\n[You]: ");
    }
    if (typeof input === "string" && input.trim() === "") continue;
    response = await openAIClient.responses.create(
      {
        conversation: response && 'id' in response && !isStream ? undefined : conversation.id,
        input,
        previous_response_id: response && 'id' in response && !isStream ? response.id : undefined,
        stream: isStream,
      },
      {
        body: { agent: { name: agent.name, type: "agent_reference" } },
      },
    );
    if (isStream && response instanceof Stream) {
      let isFirstChunk = true;
      for await (const event of response) {
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
          // console.log(`${event.response.output.filter(o => o.type === 'message').map(o => o.content.filter(c => c.type === 'output_text').map(c => c.text).join('')).join('')}`);
          approvalRequestedTools.length = 0; // Clear previous requests
          approvalRequestedTools.push(...event.response.output.filter(o => o.type === 'mcp_approval_request'));
        }
      }
    } else if (!isStream && response && 'output_text' in response) {
      response.output_text && console.log(`[${agent.name}]: ${response.output_text}`);
      approvalRequestedTools.length = 0; // Clear previous requests
      approvalRequestedTools.push(...response.output.filter(o => o.type === 'mcp_approval_request'));
    }
  }
}

main().catch((error) => {
  if (error.message.includes("Ctrl+C")) return; // Ignore Ctrl+C errors
  console.error("An error occurred:", error);
});