
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage } from "@langchain/core/messages";

// Importa a chave de API do ambiente, garantindo a segurança.
// Lembre-se de ter o GEMINI_API_KEY configurado no seu .env
const model = new ChatGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
  model: "gemini-1.5-pro-latest", // Corrigido de modelName para model
  maxOutputTokens: 2048,
  temperature: 0.7,
});

async function runJuniorInvestigator() {
  console.log("========================================");
  console.log("🚀 Iniciando Investigador Júnior (PoC com LangChain)");
  console.log("========================================");

  try {
    const question = "Qual é o principal produto da Senior Sistemas e quem são seus dois maiores concorrentes no Brasil?";
    
    console.log(`Ponderando sobre a pergunta: "${question}"...`);

    const response = await model.invoke([
      new HumanMessage(question),
    ]);

    console.log("\n💡 Resposta do Investigador Júnior:\n");
    console.log(response.content);
    console.log("\n========================================");
    console.log("✅ Investigação Júnior concluída.");
    console.log("========================================");

  } catch (error) {
    console.error("\n❌ Erro durante a execução do investigador:", error);
  }
}

// Para executar este script, use: npx ts-node scripts/poc-agent.ts
runJuniorInvestigator();
