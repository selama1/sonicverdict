import { GoogleGenAI, GenerateContentResponse, Chat } from "@google/genai";
import { ProducerReport, FileData } from "../types";
import { STEP_1_SYSTEM_PROMPT } from "../constants";
import { STEP_2_SYSTEM_PROMPT } from "../constants";

const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found. Please set process.env.API_KEY");
  }
  return new GoogleGenAI({ apiKey });
};

export const analyzeAudio = async (
  artistName: string,
  songName: string,
  intent: string,
  aiUsage: string,
  audioFile: FileData
): Promise<ProducerReport> => {
  const ai = getAIClient();
  
  const prompt = `
    Artist Name: ${artistName}
    Song Name: ${songName}
    AI Usage: ${aiUsage}
    Artist's Stated Intent: ${intent}
  `;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: audioFile.mimeType,
              data: audioFile.base64,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        systemInstruction: STEP_1_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        temperature: 0.5
        ,
      },
    });

    if (!response.text) {
        throw new Error("No response from model");
    }

    const parsedData = JSON.parse(response.text);
    // Add metadata back to the object for the UI
    return {
        ...parsedData,
        artistName,
        songName
    };

  } catch (error) {
    console.error("Error analyzing audio:", error);
    throw error;
  }
};

export const generatePanelDiscussionStream = async (
    report: ProducerReport,
    onChunk: (text: string) => void
) => {
  const ai = getAIClient();
  
  const contextPrompt = `
  Here is the analysis of the song "${report.songName}" by "${report.artistName}".
  
  Scores: ${JSON.stringify(report.scores)}
  Lyrics: ${report.lyrics}
  Technical Analysis: ${JSON.stringify(report.technicalAnalysis)}
  Intent vs Execution: ${JSON.stringify(report.intentVsExecution)}
  
  Start the panel discussion now.
  `;

  // Create a chat session to maintain context if we wanted to continue, 
  // but here we just need a one-off generation based on the prompt template constants
  // However, since we need to 'act' based on previous data, a fresh prompt with context is fine.
  
  const chat: Chat = ai.chats.create({
    model: "gemini-2.5-flash",
    config: {
        //systemInstruction: "You are a panel of 4 music producers: The Hit-Seeker, The Artiste, The Niche Specialist, and The Ruthless Executive. Argue about the song provided. Output strictly as a script with names like 'THE HIT-SEEKER:'.",
        systemInstruction: STEP_2_SYSTEM_PROMPT,
    }
  });

  try {
      const resultStream = await chat.sendMessageStream({ message: contextPrompt });
      
      for await (const chunk of resultStream) {
        const text = chunk.text; // Access directly
        if (text) {
            onChunk(text);
        }
      }
  } catch (e) {
      console.error("Stream error", e);
      throw e;
  }
};