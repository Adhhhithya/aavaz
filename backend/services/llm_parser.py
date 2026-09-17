import json
from groq import AsyncGroq
from config import settings

# Initialize Groq client
client = AsyncGroq(api_key=settings.GROQ_API_KEY)
MODEL_NAME = "openai/gpt-oss-120b"

async def generate_chat_response(messages: list, case_context: dict = None) -> str:
    """
    Generate a response for the chatbot based on conversation history.
    messages format: [{"role": "user"|"model", "content": "..."}]
    """
    
    system_prompt = "You are a helpful, empathetic mental health assistant and legal guide for victims navigating the eCourts system. IMPORTANT: Your responses MUST be in plain text only. Do NOT use markdown (no **, no bullet points, no bold). Keep your responses extremely concise and conversational, reducing verbosity by 25%."
    
    if case_context:
        system_prompt += f"\n\nContext about the user and their case:\n"
        system_prompt += f"- Name: {case_context.get('user_name', 'Unknown')}\n"
        system_prompt += f"- Role: {case_context.get('role_type', 'Unknown')}\n"
        system_prompt += f"- Preferred Language: {case_context.get('preferred_language', 'Unknown')}\n"
        system_prompt += f"- Case Type: {case_context.get('case_type', 'Unknown')}\n"
        system_prompt += f"- Case Stage: {case_context.get('case_stage', 'Unknown')}\n"
        system_prompt += f"- Current Distress Score: {case_context.get('current_distress_score', 'Unknown')}/100\n"
        system_prompt += "\nPlease personalize your responses based on this context when appropriate, while maintaining empathy and professionalism."
    
    # Map 'model' to 'assistant' for Groq/OpenAI format
    formatted_messages = [{"role": "system", "content": system_prompt}]
    for msg in messages:
        role = "assistant" if msg.get("role") == "model" else msg.get("role", "user")
        formatted_messages.append({"role": role, "content": msg.get("content", "")})
    
    response = await client.chat.completions.create(
        model=MODEL_NAME,
        messages=formatted_messages,
    )
    
    return response.choices[0].message.content.strip()
