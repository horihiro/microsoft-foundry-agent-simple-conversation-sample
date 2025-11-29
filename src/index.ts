import { DefaultAzureCredential } from "@azure/identity";
import { AIProjectClient } from "@azure/ai-projects";
import { stdin as input, stdout as output } from 'node:process';
import OpenAI from "openai";
import { Stream } from "openai/core/streaming";
import readline from 'readline/promises';

import { loadEnvFile } from "node:process"
loadEnvFile('./.env');

const rl = readline.createInterface({ input, output });
const projectEndpoint = process.env.PROJECT_ENDPOINT || "";
const conversationId = process.env.CONVERSATION_ID || "";
const agentName = process.env.AGENT_NAME || "";
const isStream = process.env.STREAM_RESPONSE === "true";

async function main(): Promise<void> {
  const credential = new DefaultAzureCredential();
  const projectClient = new AIProjectClient(projectEndpoint, credential);

  const agent = await projectClient.agents.get(agentName);
  const openAIClient = await projectClient.getOpenAIClient();
  const conversation = conversationId ? await openAIClient.conversations.retrieve(conversationId) : await openAIClient.conversations.create();

  let response: OpenAI.Responses.Response | Stream<OpenAI.Responses.ResponseStreamEvent> | undefined = undefined;
  while (true) {
    const input = await rl.question("[You]: ");
    if (input.trim() === "") continue;
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
      for await (const event of response) {
        // Handle different event types
        if (event.type === "response.created") {
          process.stdout.write(`[${agent.name}]: `);
        } else if (event.type === "response.output_text.delta") {
          // Print delta text as it arrives (without newlines to show streaming effect)
          process.stdout.write(event.delta);
        } else if (event.type === "response.output_text.done") {
          // console.log(`\n\nResponse done with full text: ${event.text}`);
        } else if (event.type === "response.completed") {
          // console.log(`Response completed with full message: ${event.response.output_text}`);
          process.stdout.write("\n");
        }
      }
    } else if (!isStream && response && 'output_text' in response) {
      console.log(`[${agent.name}]: ${response.output_text}`);
    }
  }
}

main().catch((error) => {
  if (error.message.includes("Ctrl+C")) return; // Ignore Ctrl+C errors
  console.error("An error occurred:", error);
});