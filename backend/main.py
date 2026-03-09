"""
FastAPI Backend for Chemistry Teaching Avatar
Pure Gemini API implementation - no Ollama dependency
"""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import google.generativeai as genai
import json
import asyncio
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI(title="Chemistry Avatar API", version="1.0.0")

# Configure Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
if not GEMINI_API_KEY:
    # Try to check if it's in the .env file directly just in case
    # This is a fallback
    pass

if not GEMINI_API_KEY:
    print("Warning: GEMINI_API_KEY not found in environment variables.")
    
try:
    genai.configure(api_key=GEMINI_API_KEY)
except Exception as e:
    print(f"Error configuring Gemini API: {e}")

GEMINI_MODEL = "gemini-2.5-flash"

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "https://www.elixra.in"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class MessageHistory(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    context: Optional[str] = None
    chemicals: Optional[List[str]] = None
    equipment: Optional[List[str]] = None
    history: Optional[List[MessageHistory]] = None

# Health check
class MoleculeGenerationRequest(BaseModel):
    query: str

import time

class AtomRequest(BaseModel):
    id: str
    element: str
    x: float
    y: float
    z: float

class BondRequest(BaseModel):
    id: str
    from_id: str = Field(..., alias="from")
    to_id: str = Field(..., alias="to")
    type: str

class MoleculeAnalysisRequest(BaseModel):
    atoms: List[AtomRequest]
    bonds: List[BondRequest]

@app.post("/analyze-molecule")
async def analyze_molecule(request: MoleculeAnalysisRequest):
    """Analyze a molecule structure using Gemini"""
    start_time = time.time()
    
    # Log request details
    request_id = str(int(time.time() * 1000))
    print(f"[{request_id}] 🧪 ANALYSIS REQUEST STARTED")
    print(f"[{request_id}] Atoms: {len(request.atoms)}, Bonds: {len(request.bonds)}")
    
    try:
        # Construct a description of the molecule from the atoms and bonds
        atom_list = ", ".join([f"{a.element} (ID: {a.id})" for a in request.atoms])
        bond_list = ", ".join([f"{b.type} bond between {b.from_id} and {b.to_id}" for b in request.bonds])
        
        prompt = f"""Analyze this molecular structure:
        Atoms: {atom_list}
        Bonds: {bond_list}
        
        Provide a comprehensive analysis in valid JSON format with the following structure:
        {{
          "name": "IUPAC Name or Common Name",
          "formula": "Chemical Formula (e.g. C2H6O)",
          "molecularWeight": 0.0,
          "structure": {{
            "geometry": "Molecular geometry (e.g., Trigonal Planar, Octahedral, Tetrahedral)",
            "bondAngles": "Approximate bond angles (e.g., 120°)",
            "hybridization": "Central atom hybridization (e.g., sp2)",
            "polarity": "Dipole moment description"
          }},
          "properties": {{
            "state": "Gas/Liquid/Solid at room temp",
            "solubility": "Solubility description",
            "polarity": "Polar/Non-polar",
            "boilingPoint": "Estimated boiling point in Celsius (number only)",
            "meltingPoint": "Estimated melting point in Celsius (number only)"
          }},
          "stability": "Stable/Unstable",
          "safety": {{
            "flammability": "Low/Medium/High",
            "toxicity": "Description",
            "handling": "Precautions"
          }},
          "uses": ["Industrial use", "Common use", "Research"],
          "description": "A detailed 2-3 sentence description of the molecule and its significance.",
          "functionalGroups": ["Alcohol", "Amine", "Ketone", etc]
        }}
        
        IMPORTANT:
        1. Infer the molecule from the connectivity.
        2. If it's a known molecule, provide accurate real-world data.
        3. If it's a novel/theoretical molecule, estimate properties based on chemical principles.
        4. Return ONLY valid JSON.
        """
        
        model = genai.GenerativeModel(GEMINI_MODEL)
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.2,
                response_mime_type="application/json"
            )
        )
        
        if response.text:
            text = response.text.strip()
            if text.startswith("```json"): text = text[7:]
            if text.startswith("```"): text = text[3:]
            if text.endswith("```"): text = text[:-3]
            
            data = json.loads(text.strip())
            
            # Log success
            duration = time.time() - start_time
            print(f"[{request_id}] ✓ ANALYSIS COMPLETE in {duration:.2f}s")
            print(f"[{request_id}] Result: {data.get('name')} ({data.get('formula')})")
            
            return data
            
        raise HTTPException(status_code=500, detail="Empty response from AI")
        
    except Exception as e:
        duration = time.time() - start_time
        print(f"[{request_id}] ✗ ANALYSIS FAILED in {duration:.2f}s: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/generate-molecule")
async def generate_molecule(request: MoleculeGenerationRequest):
    """Generate 3D molecule structure from query using Gemini"""
    print(f"🧪 Generating molecule for query: '{request.query}'")
    prompt = f"""Generate the 3D molecular structure for: {request.query}
    
    Return a valid JSON object with this EXACT structure:
    {{
      "name": "Molecule Name",
      "formula": "Chemical Formula",
      "description": "Short description",
      "atoms": [
        {{"id": "a1", "element": "C", "x": 0.0, "y": 0.0, "z": 0.0, "color": "#909090"}}
      ],
      "bonds": [
        {{"id": "b1", "from": "a1", "to": "a2", "type": "single"}}
      ],
      "molecularWeight": 0.0,
      "difficulty": "intermediate",
      "tags": ["tag1", "tag2"]
    }}
    
    IMPORTANT:
    1. Coordinates (x,y,z) should be in Angstroms, centered at 0,0,0.
    2. Bond types: single, double, triple, aromatic.
    3. Element symbols must be standard (C, H, O, N, etc).
    4. Colors should be standard CPK colors (C: #909090, H: #FFFFFF, O: #FF0D0D, N: #3050F8, etc).
    5. Ensure the structure is chemically valid.
    6. Return ONLY valid JSON.
    """
    
    try:
        model = genai.GenerativeModel(GEMINI_MODEL)
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.1,
                response_mime_type="application/json"
            )
        )
        
        if response.text:
            text = response.text.strip()
            if text.startswith("```json"): text = text[7:]
            if text.startswith("```"): text = text[3:]
            if text.endswith("```"): text = text[:-3]
            
            data = json.loads(text.strip())
            print(f"✓ Generated: {data.get('name')}")
            return data
            
        raise HTTPException(status_code=500, detail="Empty response from AI")
        
    except Exception as e:
        print(f"Error generating molecule: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    return {
        "status": "online",
        "service": "Chemistry Teaching Avatar",
        "version": "1.0.0",
        "model": GEMINI_MODEL
    }

@app.get("/health")
async def health_check():
    """Check if Gemini API is available"""
    try:
        # Test API connection
        model = genai.GenerativeModel(GEMINI_MODEL)
        response = model.generate_content("test", stream=False)
        return {
            "status": "healthy",
            "gemini": "connected",
            "model": GEMINI_MODEL
        }
    except Exception as e:
        return {
            "status": "degraded",
            "gemini": "disconnected",
            "error": str(e)
        }

async def generate_stream(query: str, context: str = "", chemicals: List[str] = None, equipment: List[str] = None, history: List[dict] = None):
    """Generate streaming response from Gemini"""
    
    # Build system prompt - More detailed and educational
    system_prompt = """You are ERA, an expert chemistry teacher and tutor. Your role is to:
1. Answer chemistry questions thoroughly and accurately
2. Explain concepts clearly with examples when helpful
3. Be friendly, encouraging, and patient
4. Provide detailed explanations for complex topics
5. Use proper chemistry terminology
6. When asked about reactions, explain the mechanism, products, and conditions
7. For SN1, SN2, E1, E2 reactions: explain the mechanism, rate law, stereochemistry, and examples
8. For general chemistry: provide comprehensive but understandable explanations

Format your responses naturally - use paragraphs, bullet points, or whatever format best explains the concept.
Be thorough but concise. Aim for clarity over brevity."""

    # Build conversation context
    conversation_context = ""
    if history and len(history) > 2:
        conversation_context = "\n\nPrevious conversation context:\n"
        for msg in history[-6:]:
            role = "Student" if msg.get('role') == 'user' else "ERA"
            content = msg.get('content', '')
            conversation_context += f"{role}: {content}\n"

    # Build user prompt
    user_prompt = f"Student question: {query}"
    if context:
        user_prompt += f"\nLab context: {context}"
    if chemicals:
        user_prompt += f"\nChemicals involved: {', '.join(chemicals[:5])}"
    if conversation_context:
        user_prompt += conversation_context

    try:
        model = genai.GenerativeModel(GEMINI_MODEL)
        
        # Create streaming response with higher token limit for detailed answers
        response = model.generate_content(
            f"{system_prompt}\n\n{user_prompt}",
            stream=True,
            generation_config=genai.types.GenerationConfig(
                temperature=0.7,
                max_output_tokens=1000,
                top_p=0.9,
                top_k=40,
            )
        )
        
        # Stream tokens as they come
        for chunk in response:
            if chunk.text:
                # Send each chunk as a complete token
                yield json.dumps({"token": chunk.text}) + "\n"
        
    except Exception as e:
        error_msg = f"Error: {str(e)}"
        yield json.dumps({"token": error_msg, "error": True}) + "\n"

@app.post("/chat")
async def chat(request: ChatRequest):
    """HTTP endpoint for streaming chat"""
    history = [h.dict() if hasattr(h, 'dict') else h for h in (request.history or [])]
    return StreamingResponse(
        generate_stream(request.message, request.context, request.chemicals, request.equipment, history),
        media_type="application/x-ndjson"
    )

@app.post("/analyze-reaction")
async def analyze_reaction(request: ChatRequest):
    """Specialized endpoint for reaction analysis"""
    if not request.chemicals or len(request.chemicals) < 2:
        raise HTTPException(status_code=400, detail="At least 2 chemicals required")
    
    chemicals_str = ', '.join(request.chemicals[:2])
    
    # Build equipment context
    equipment_context = ""
    if request.equipment and len(request.equipment) > 0:
        equipment_list = ', '.join(request.equipment)
        equipment_context = f"\n\nLab Equipment Being Used: {equipment_list}\nIMPORTANT: Consider how this equipment affects the reaction (temperature, mixing, reaction rate, etc.)"
        print(f"✓ Equipment: {equipment_list}")
    else:
        print(f"✓ No equipment specified")
    
    # Detailed prompt requesting JSON structure
    prompt = f"""Analyze this chemical reaction:
Chemicals: {chemicals_str}{equipment_context}

Respond with a valid JSON object containing the following structure. 
IMPORTANT: 
1. Do not use Markdown formatting.
2. Ensure all string values are single-line and properly escaped.
3. Do not include unescaped newlines or line breaks inside string values.
4. Keep all descriptions concise and short to avoid truncation.

{{
  "balancedEquation": "balanced chemical equation",
  "reactionType": "type of reaction",
  "visualObservation": "what is visually observed (single sentence summary)",
  "color": "color of solution/products",
  "smell": "smell if any, or 'none'",
  "temperatureChange": "exothermic/endothermic/none",
  "gasEvolution": "name of gas or null",
  "emission": "light/sound or null",
  "stateChange": "description of state change or null",
  "phChange": "number or description of pH change",
  "instrumentAnalysis": {{
    "name": "instrument name",
    "intensity": "intensity/settings",
    "change": "physical/chemical change caused",
    "outcomeDifference": "how outcome differs",
    "counterfactual": "what would happen without it"
  }},
  "productsInfo": [
    {{
      "name": "product name",
      "state": "solid/liquid/gas/aqueous",
      "color": "color",
      "characteristics": "key characteristics (concise)",
      "commonUses": "common uses",
      "safetyHazards": "specific hazards"
    }}
  ],
  "explanation": {{
    "mechanism": "reaction mechanism type (concise)",
    "bondBreaking": "bond breaking details (concise)",
    "electronTransfer": "electron transfer details (concise)",
    "energyProfile": "energy profile description (concise)",
    "atomicLevel": "atomic/molecular level explanation (concise)",
    "keyConcept": "core chemistry concept demonstrated"
  }},
  "safety": {{
    "riskLevel": "Low/Medium/High",
    "precautions": "key precautions",
    "disposal": "disposal instructions",
    "firstAid": "first aid measures",
    "generalHazards": "general hazards"
  }},
  "precipitate": true/false,
  "precipitateColor": "color or null",
  "confidence": 0.9
}}

If no instrument is used, set instrumentAnalysis to null.
"""

    try:
        model = genai.GenerativeModel(GEMINI_MODEL)
        
        # Retry logic for robustness
        for attempt in range(2):
            try:
                # Configure generation with JSON enforcement
                config = genai.types.GenerationConfig(
                    temperature=0.1,
                    max_output_tokens=4000,
                    top_p=0.8,
                    top_k=20,
                    response_mime_type="application/json"
                )
                
                response = model.generate_content(
                    prompt,
                    stream=False,
                    generation_config=config
                )
                
                if response.text:
                    text = response.text.strip()
                    # Clean up markdown if present
                    if text.startswith("```json"):
                        text = text[7:]
                    if text.startswith("```"):
                        text = text[3:]
                    if text.endswith("```"):
                        text = text[:-3]
                    text = text.strip()
                
                    print(f"✓ Prompt: {chemicals_str} (Attempt {attempt+1})")
                    if request.equipment and attempt == 0:
                        print(f"✓ Lab Equipment: {', '.join(request.equipment)}")
                    
                    data = json.loads(text)
                    
                    # Normalize data for frontend
                    result = {
                        "name": data.get("name", "Unknown Molecule"),
                        "formula": data.get("formula", "Unknown"),
                        "molecularWeight": data.get("molecularWeight", 0.0),
                        "structure": data.get("structure", {}),
                        "properties": data.get("properties", {}),
                        "stability": data.get("stability", "Unknown"),
                        "safety": data.get("safety", {}),
                        "uses": data.get("uses", []),
                        "description": data.get("description", ""),
                        "functionalGroups": data.get("functionalGroups", []),
                        
                        # Keep existing fields just in case
                        "balancedEquation": data.get("balancedEquation", "Unknown equation"),
                        "reactionType": data.get("reactionType", "Unknown"),
                        "visualObservation": data.get("visualObservation", "Reaction occurred"),
                        "color": data.get("color", "unknown"),
                        "smell": data.get("smell", "none"),
                        "temperatureChange": data.get("temperatureChange", "none"),
                        "gasEvolution": data.get("gasEvolution"),
                        "emission": data.get("emission"),
                        "stateChange": data.get("stateChange"),
                        "phChange": data.get("phChange"),
                        "instrumentAnalysis": data.get("instrumentAnalysis"),
                        "productsInfo": data.get("productsInfo", []),
                        "explanation": data.get("explanation", {
                            "mechanism": "Unknown",
                            "bondBreaking": "Unknown",
                            "atomicLevel": "Analysis unavailable",
                            "keyConcept": "Unknown"
                        }),
                        "precipitate": data.get("precipitate", False),
                        "precipitateColor": data.get("precipitateColor"),
                        "confidence": data.get("confidence", 0.5),
                        
                        # Legacy mapping
                        "products": [p["name"] for p in data.get("productsInfo", [])],
                        "observations": [data.get("visualObservation", "")],
                        "temperature": "increased" if data.get("temperatureChange") == "exothermic" else 
                                      "decreased" if data.get("temperatureChange") == "endothermic" else "unchanged",
                        "safetyNotes": [data.get("safety", {}).get("generalHazards", "Handle with care")]
                    }
                    
                    print(f"✓ Parsed JSON successfully")
                    return result
            
            except Exception as e:
                print(f"✗ Attempt {attempt+1} failed: {e}")
                if attempt == 1: # Last attempt
                    raise HTTPException(status_code=500, detail=f"Failed to generate valid analysis: {str(e)}")
        
        raise HTTPException(status_code=500, detail="No valid response from AI")

    except Exception as e:
        print(f"✗ Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time streaming"""
    await websocket.accept()
    
    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            query = message_data.get('message', '')
            context = message_data.get('context', '')
            chemicals = message_data.get('chemicals', [])
            equipment = message_data.get('equipment', [])
            history = message_data.get('history', [])
            
            # Stream response back to client
            async for token_data in generate_stream(query, context, chemicals, equipment, history):
                await websocket.send_text(token_data)
            
            # Send completion signal
            await websocket.send_text(json.dumps({"done": True}) + "\n")
            
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.close()

# Quiz Models
class QuizConfig(BaseModel):
    difficulty: str  # easy, medium, hard
    num_questions: int
    question_types: List[str]  # explanation, mcq, complete_reaction, balance_equation, guess_product, etc
    include_timer: bool
    time_limit_per_question: Optional[int] = None  # in seconds
    user_id: Optional[str] = None
    topics: Optional[List[str]] = None  # user-selected topics, empty list means all topics

class QuizQuestion(BaseModel):
    id: int
    question_text: str
    question_type: str
    options: Optional[List[str]] = None  # for MCQ
    correct_answer: str
    explanation: str
    topic: str

class UserAnswer(BaseModel):
    question_id: int
    user_answer: str
    time_taken: int  # in seconds
    suggestions: Optional[str] = None

class QuizSession(BaseModel):
    session_id: str
    config: QuizConfig
    questions: List[QuizQuestion]
    current_question_index: int = 0
    user_answers: Dict[int, UserAnswer] = {}
    user_id: Optional[str] = None
    completed: bool = False

class QuizResult(BaseModel):
    question_id: int
    question_text: str
    question_type: str
    user_answer: str
    correct_answer: str
    is_correct: bool
    explanation: str
    topic: str
    time_taken: int
    suggestions: str

# Store active quiz sessions (in production, use database)
quiz_sessions = {}

@app.post("/quiz/generate")
async def generate_quiz(config: QuizConfig):
    """Generate a new quiz with specified configuration"""
    import uuid
    import random
    
    session_id = str(uuid.uuid4())
    
    # Generate questions based on config
    questions = []
    
    # Use selected topics or all topics if none selected
    all_topics = [
        "Atomic Structure", "Periodic Table", "Chemical Bonding", "Stoichiometry", 
        "States of Matter", "Thermodynamics", "Chemical Equilibrium", "Acids and Bases",
        "Redox Reactions", "Electrochemistry", "Chemical Kinetics", "Organic Chemistry Basics",
        "Hydrocarbons", "Alcohols and Ethers", "Aldehydes and Ketones", "Carboxylic Acids",
        "Biomolecules", "Polymers", "Environmental Chemistry", "Nuclear Chemistry"
    ]
    
    # Filter topics based on user selection
    if config.topics and len(config.topics) > 0:
        selected_topics = [t for t in config.topics if t in all_topics]
        if not selected_topics:
            selected_topics = all_topics
    else:
        selected_topics = all_topics
    
    # Shuffle and cycle through topics
    topics_cycle = selected_topics.copy()
    random.shuffle(topics_cycle)
    
    # Keep track of generated question texts/hashes to enforce uniqueness
    generated_questions_texts = []
    
    for i in range(config.num_questions):
        question_type = random.choice(config.question_types)
        
        # Select a unique topic for this question
        topic = topics_cycle[i % len(topics_cycle)]
        
        # Try up to 3 times to generate a unique question
        question = None
        for attempt in range(3):
            # Pass previously generated question texts to avoid
            avoid_list = generated_questions_texts[-5:] # Keep it manageable
            
            if question_type == "mcq":
                temp_q = await generate_mcq_question(config.difficulty, topic, avoid_list)
            elif question_type == "explanation":
                temp_q = await generate_explanation_question(config.difficulty, topic, avoid_list)
            elif question_type == "complete_reaction":
                temp_q = await generate_complete_reaction_question(config.difficulty, topic, avoid_list)
            elif question_type == "balance_equation":
                temp_q = await generate_balance_equation_question(config.difficulty, topic, avoid_list)
            elif question_type == "guess_product":
                temp_q = await generate_guess_product_question(config.difficulty, topic, avoid_list)
            else:
                temp_q = await generate_mcq_question(config.difficulty, topic, avoid_list)
            
            # Check uniqueness (simple fuzzy match or exact match)
            is_duplicate = False
            for existing_text in generated_questions_texts:
                # Check for high similarity or exact match
                if temp_q.question_text.lower().strip() == existing_text.lower().strip():
                    is_duplicate = True
                    break
                # Basic containment check for very similar questions
                if len(temp_q.question_text) > 10 and temp_q.question_text.lower() in existing_text.lower():
                    is_duplicate = True
                    break
            
            if not is_duplicate:
                question = temp_q
                break
            else:
                print(f"Duplicate generated, retrying ({attempt+1}/3): {temp_q.question_text[:30]}...")
        
        # If still duplicate after retries, use it anyway but log it (or could fetch fallback)
        if not question:
            print("Warning: Could not generate unique question after retries")
            question = temp_q

        question.id = i + 1
        questions.append(question)
        generated_questions_texts.append(question.question_text)
    
    # Create session
    session = QuizSession(
        session_id=session_id,
        config=config,
        questions=questions,
        current_question_index=0,
        user_id=config.user_id
    )
    
    quiz_sessions[session_id] = session
    
    topics_info = f"Topics: {', '.join(selected_topics[:3])}{'...' if len(selected_topics) > 3 else ''}"
    print(f"✓ Quiz session created: {session_id}")
    print(f"✓ Questions: {len(questions)}, Difficulty: {config.difficulty}, {topics_info}")
    
    return {
        "session_id": session_id,
        "total_questions": len(questions),
        "first_question": questions[0].dict() if questions else None
    }

async def generate_mcq_question(difficulty: str, topic: str = None, avoid_list: List[str] = None) -> QuizQuestion:
    """Generate MCQ question"""
    import random
    
    if not topic:
        topics = [
            "Atomic Structure", "Periodic Table", "Chemical Bonding", "Stoichiometry", 
            "States of Matter", "Thermodynamics", "Chemical Equilibrium", "Acids and Bases",
            "Redox Reactions", "Electrochemistry", "Chemical Kinetics", "Organic Chemistry Basics",
            "Hydrocarbons", "Alcohols and Ethers", "Aldehydes and Ketones", "Carboxylic Acids",
            "Biomolecules", "Polymers", "Environmental Chemistry", "Nuclear Chemistry"
        ]
        topic = random.choice(topics)
    
    avoid_prompt = ""
    if avoid_list:
        avoid_prompt = f"Do NOT generate any of the following questions or anything very similar: {json.dumps(avoid_list)}"

    prompt = f"""Generate a unique multiple choice chemistry question about {topic} at {difficulty} level.
    Ensure the question is different from common examples like 'pH of water' or 'atomic number of Carbon'.
    {avoid_prompt}
    
    Return ONLY valid JSON (no other text).
    IMPORTANT: Ensure all strings are single-line and properly escaped. Do not use unescaped newlines.
    
    JSON Structure:
    {{"question":"[question text]","options":["[option1]","[option2]","[option3]","[option4]"],"correct_answer":"[correct option]","explanation":"[detailed explanation]","topic":"{topic}"}}"""
    
    model = genai.GenerativeModel(GEMINI_MODEL)
    response = model.generate_content(
        prompt,
        stream=False,
        generation_config=genai.types.GenerationConfig(
            temperature=0.7,
            max_output_tokens=2000,
            response_mime_type="application/json"
        )
    )
    
    try:
        text = response.text.strip()
        # Clean up markdown code blocks if present
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
        
        data = json.loads(text)
        return QuizQuestion(
            id=0,
            question_text=data.get("question", ""),
            question_type="mcq",
            options=data.get("options", []),
            correct_answer=data.get("correct_answer", ""),
            explanation=data.get("explanation", ""),
            topic=data.get("topic", topic)
        )
    except Exception as e:
        print(f"Error generating MCQ: {e}")
        # Fallback with random variation to avoid exact duplicates
        fallback_questions = [
            {
                "q": "Which of the following is an alkali metal?",
                "opts": ["Sodium", "Calcium", "Iron", "Zinc"],
                "ans": "Sodium",
                "exp": "Alkali metals are in Group 1 of the periodic table.",
                "top": "Periodic Table"
            },
            {
                "q": "What is the main gas found in the air we breathe?",
                "opts": ["Oxygen", "Nitrogen", "Carbon Dioxide", "Hydrogen"],
                "ans": "Nitrogen",
                "exp": "Nitrogen makes up about 78% of Earth's atmosphere.",
                "top": "Environmental Chemistry"
            },
            {
                "q": "What is the chemical formula for Methane?",
                "opts": ["CH4", "C2H6", "CO2", "H2O"],
                "ans": "CH4",
                "exp": "Methane is the simplest hydrocarbon with formula CH4.",
                "top": "Hydrocarbons"
            },
            {
                "q": "Which bond involves the sharing of electron pairs?",
                "opts": ["Ionic", "Covalent", "Metallic", "Hydrogen"],
                "ans": "Covalent",
                "exp": "Covalent bonding involves the sharing of electrons between atoms.",
                "top": "Chemical Bonding"
            }
        ]
        q = random.choice(fallback_questions)
        return QuizQuestion(
            id=0,
            question_text=q["q"],
            question_type="mcq",
            options=q["opts"],
            correct_answer=q["ans"],
            explanation=q["exp"],
            topic=q["top"]
        )

async def generate_explanation_question(difficulty: str, topic: str = None, avoid_list: List[str] = None) -> QuizQuestion:
    """Generate explanation question"""
    import random
    
    if not topic:
        topics = ["General Chemistry", "Atomic Structure", "Periodic Trends", "Bonding", "Thermodynamics", "Kinetics"]
        topic = random.choice(topics)

    avoid_prompt = ""
    if avoid_list:
        avoid_prompt = f"Do NOT generate any of the following questions or anything very similar: {json.dumps(avoid_list)}"

    prompt = f"""Generate a unique chemistry explanation question about {topic} at {difficulty} level that requires a detailed answer.
    Ensure the question is not a common one (like "What is an atom?") and is specific to the topic.
    {avoid_prompt}
    
    Return ONLY valid JSON (no other text).
    IMPORTANT: Ensure all strings are single-line and properly escaped. Do not use unescaped newlines.
    
    JSON Structure:
    {{"question":"[question text]","correct_answer":"[expected answer]","explanation":"[detailed explanation]","topic":"{topic}"}}"""
    
    model = genai.GenerativeModel(GEMINI_MODEL)
    response = model.generate_content(
        prompt,
        stream=False,
        generation_config=genai.types.GenerationConfig(
            temperature=0.7,
            max_output_tokens=1000,
            response_mime_type="application/json"
        )
    )
    
    try:
        text = response.text.strip()
        # Clean up markdown code blocks if present
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        data = json.loads(text)
        return QuizQuestion(
            id=0,
            question_text=data.get("question", ""),
            question_type="explanation",
            correct_answer=data.get("correct_answer", ""),
            explanation=data.get("explanation", ""),
            topic=data.get("topic", topic)
        )
    except Exception as e:
        print(f"Error generating explanation question: {e}")
        return QuizQuestion(
            id=0,
            question_text=f"Explain the concept of {topic} in detail.",
            question_type="explanation",
            correct_answer=f"The concept of {topic} involves...",
            explanation=f"This topic covers the fundamental principles of {topic}.",
            topic=topic
        )

async def generate_complete_reaction_question(difficulty: str, topic: str = None, avoid_list: List[str] = None) -> QuizQuestion:
    """Generate complete the reaction question"""
    import random
    
    if not topic:
        topics = ["Combustion", "Acid-Base", "Precipitation", "Redox", "Synthesis", "Decomposition"]
        topic = random.choice(topics)

    avoid_prompt = ""
    if avoid_list:
        avoid_prompt = f"Do NOT generate any of the following questions or anything very similar: {json.dumps(avoid_list)}"

    prompt = f"""Generate a unique chemistry question about {topic} at {difficulty} level where the user completes a chemical reaction.
    Avoid common reactions like H2 + O2.
    {avoid_prompt}
    
    Return ONLY valid JSON (no other text).
    IMPORTANT: Ensure all strings are single-line and properly escaped. Do not use unescaped newlines.
    
    JSON Structure:
    {{"question":"[incomplete reaction equation]","correct_answer":"[complete equation]","explanation":"[explanation of the reaction]","topic":"{topic}"}}"""
    
    model = genai.GenerativeModel(GEMINI_MODEL)
    response = model.generate_content(
        prompt,
        stream=False,
        generation_config=genai.types.GenerationConfig(
            temperature=0.7,
            max_output_tokens=1000,
            response_mime_type="application/json"
        )
    )
    
    try:
        text = response.text.strip()
        # Clean up markdown code blocks if present
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        data = json.loads(text)
        return QuizQuestion(
            id=0,
            question_text=data.get("question", ""),
            question_type="complete_reaction",
            correct_answer=data.get("correct_answer", ""),
            explanation=data.get("explanation", ""),
            topic=data.get("topic", topic)
        )
    except Exception as e:
        print(f"Error generating complete reaction question: {e}")
        return QuizQuestion(
            id=0,
            question_text=f"Complete the reaction for {topic}...",
            question_type="complete_reaction",
            correct_answer="Products...",
            explanation="Reactants combine to form products.",
            topic=topic
        )

async def generate_balance_equation_question(difficulty: str, topic: str = None, avoid_list: List[str] = None) -> QuizQuestion:
    """Generate balance equation question"""
    import random
    
    if not topic:
        topics = ["Stoichiometry", "Redox", "Combustion", "Precipitation"]
        topic = random.choice(topics)

    avoid_prompt = ""
    if avoid_list:
        avoid_prompt = f"Do NOT generate any of the following questions or anything very similar: {json.dumps(avoid_list)}"

    prompt = f"""Generate a unique chemistry question about {topic} at {difficulty} level where the user balances a chemical equation.
    Avoid common examples like Fe + O2.
    {avoid_prompt}
    
    Return ONLY valid JSON (no other text).
    IMPORTANT: Ensure all strings are single-line and properly escaped. Do not use unescaped newlines.
    
    JSON Structure:
    {{"question":"[unbalanced equation]","correct_answer":"[balanced equation]","explanation":"[explanation of balancing]","topic":"{topic}"}}"""
    
    model = genai.GenerativeModel(GEMINI_MODEL)
    response = model.generate_content(
        prompt,
        stream=False,
        generation_config=genai.types.GenerationConfig(
            temperature=0.7,
            max_output_tokens=1000,
            response_mime_type="application/json"
        )
    )
    
    try:
        text = response.text.strip()
        # Clean up markdown code blocks if present
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        data = json.loads(text)
        return QuizQuestion(
            id=0,
            question_text=data.get("question", ""),
            question_type="balance_equation",
            correct_answer=data.get("correct_answer", ""),
            explanation=data.get("explanation", ""),
            topic=data.get("topic", topic)
        )
    except Exception as e:
        print(f"Error generating balance equation question: {e}")
        return QuizQuestion(
            id=0,
            question_text=f"Balance the equation for {topic}",
            question_type="balance_equation",
            correct_answer="Balanced equation...",
            explanation="Ensure atoms are conserved.",
            topic=topic
        )

async def generate_guess_product_question(difficulty: str, topic: str = None, avoid_list: List[str] = None) -> QuizQuestion:
    """Generate guess the product question"""
    import random
    
    if not topic:
        topics = ["Reactions", "Synthesis", "Decomposition", "Single Replacement", "Double Replacement"]
        topic = random.choice(topics)

    avoid_prompt = ""
    if avoid_list:
        avoid_prompt = f"Do NOT generate any of the following questions or anything very similar: {json.dumps(avoid_list)}"

    prompt = f"""Generate a unique chemistry question about {topic} at {difficulty} level where the user guesses the product of a reaction.
    Avoid common examples like Na + Cl2.
    {avoid_prompt}
    
    Return ONLY valid JSON (no other text).
    IMPORTANT: Ensure all strings are single-line and properly escaped. Do not use unescaped newlines.
    
    JSON Structure:
    {{"question":"[reactants given]","correct_answer":"[product]","explanation":"[explanation of the reaction]","topic":"{topic}"}}"""
    
    model = genai.GenerativeModel(GEMINI_MODEL)
    response = model.generate_content(
        prompt,
        stream=False,
        generation_config=genai.types.GenerationConfig(
            temperature=0.7,
            max_output_tokens=1000,
            response_mime_type="application/json"
        )
    )
    
    try:
        text = response.text.strip()
        # Clean up markdown code blocks if present
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        data = json.loads(text)
        return QuizQuestion(
            id=0,
            question_text=data.get("question", ""),
            question_type="guess_product",
            correct_answer=data.get("correct_answer", ""),
            explanation=data.get("explanation", ""),
            topic=data.get("topic", topic)
        )
    except Exception as e:
        print(f"Error generating guess product question: {e}")
        return QuizQuestion(
            id=0,
            question_text=f"What is the product of this {topic} reaction?",
            question_type="guess_product",
            correct_answer="Product...",
            explanation="Reactants form products.",
            topic=topic
        )

@app.get("/quiz/session/{session_id}/question/{question_index}")
async def get_question(session_id: str, question_index: int):
    """Get a specific question from the quiz"""
    if session_id not in quiz_sessions:
        raise HTTPException(status_code=404, detail="Quiz session not found")
    
    session = quiz_sessions[session_id]
    if question_index < 0 or question_index >= len(session.questions):
        raise HTTPException(status_code=400, detail="Invalid question index")
    
    question = session.questions[question_index]
    session.current_question_index = question_index
    
    # Get existing answer if any
    user_answer = None
    if question.id in session.user_answers:
        user_answer = session.user_answers[question.id].user_answer

    return {
        "question_number": question_index + 1,
        "total_questions": len(session.questions),
        "question": question.dict(),
        "user_answer": user_answer,
        "can_go_back": question_index > 0,
        "can_go_forward": question_index < len(session.questions) - 1
    }

@app.post("/quiz/session/{session_id}/submit-answer")
async def submit_answer(session_id: str, answer: UserAnswer):
    """Submit an answer and get feedback"""
    if session_id not in quiz_sessions:
        raise HTTPException(status_code=404, detail="Quiz session not found")
    
    session = quiz_sessions[session_id]
    if answer.question_id < 1 or answer.question_id > len(session.questions):
        raise HTTPException(status_code=400, detail="Invalid question ID")
    
    question = session.questions[answer.question_id - 1]
    
    # Check if answer is correct - normalize both strings
    user_ans = answer.user_answer.lower().strip()
    correct_ans = question.correct_answer.lower().strip()
    is_correct = user_ans == correct_ans
    
    # Generate suggestions if wrong
    suggestions = ""
    if not is_correct:
        prompt = f"""The user answered incorrectly to this chemistry question:
Question: {question.question_text}
User's answer: {answer.user_answer}
Correct answer: {question.correct_answer}
Topic: {question.topic}

Provide 3 short, specific learning suggestions (bullet points) to help them understand this topic better. 
Do not include any introductory text like "Here are suggestions". Start directly with the first suggestion."""
        
        try:
            model = genai.GenerativeModel(GEMINI_MODEL)
            response = model.generate_content(
                prompt,
                stream=False,
                generation_config=genai.types.GenerationConfig(
                    temperature=0.7,
                    max_output_tokens=300,
                )
            )
            suggestions = response.text.strip()
        except Exception as e:
            print(f"Error generating suggestions: {e}")
            suggestions = "Review the topic in your textbook."

    # Update answer with suggestions and store in session
    answer.suggestions = suggestions
    session.user_answers[answer.question_id] = answer
    
    result = QuizResult(
        question_id=answer.question_id,
        question_text=question.question_text,
        question_type=question.question_type,
        user_answer=answer.user_answer,
        correct_answer=question.correct_answer,
        is_correct=is_correct,
        explanation=question.explanation,
        topic=question.topic,
        time_taken=answer.time_taken,
        suggestions=suggestions
    )
    
    return result.dict()

@app.post("/quiz/session/{session_id}/finish")
async def finish_quiz(session_id: str, answers: List[UserAnswer]):
    """Finish quiz and get comprehensive results"""
    if session_id not in quiz_sessions:
        raise HTTPException(status_code=404, detail="Quiz session not found")
    
    session = quiz_sessions[session_id]
    if session.completed:
        raise HTTPException(status_code=400, detail="Quiz already completed")
        
    results = []
    correct_count = 0
    total_time = 0
    
    for answer in answers:
        if answer.question_id < 1 or answer.question_id > len(session.questions):
            continue
            
        question = session.questions[answer.question_id - 1]
        
        # Normalize and compare answers
        user_ans = answer.user_answer.lower().strip()
        correct_ans = question.correct_answer.lower().strip()
        is_correct = user_ans == correct_ans
        
        if is_correct:
            correct_count += 1
        
        total_time += answer.time_taken
        
        # Get suggestions from existing session data or client data, or generate if missing
        suggestions = answer.suggestions or ""
        
        # Check if we already have it in session (from submit-answer)
        if not suggestions and answer.question_id in session.user_answers:
             suggestions = session.user_answers[answer.question_id].suggestions or ""
             
        # Generate if still missing and incorrect
        if not is_correct and not suggestions:
            try:
                prompt = f"""The user answered incorrectly to this chemistry question:
Question: {question.question_text}
User's answer: {answer.user_answer}
Correct answer: {question.correct_answer}
Topic: {question.topic}

Provide 3 short, specific learning suggestions (bullet points) to help them understand this topic better. 
Do not include any introductory text like "Here are suggestions". Start directly with the first suggestion."""
                
                model = genai.GenerativeModel(GEMINI_MODEL)
                response = model.generate_content(
                    prompt,
                    stream=False,
                    generation_config=genai.types.GenerationConfig(
                        temperature=0.7,
                        max_output_tokens=300,
                    )
                )
                suggestions = response.text.strip()
            except Exception as e:
                print(f"Error generating suggestions in finish: {e}")
                suggestions = "Review the topic materials."
        
        result = QuizResult(
            question_id=answer.question_id,
            question_text=question.question_text,
            question_type=question.question_type,
            user_answer=answer.user_answer,
            correct_answer=question.correct_answer,
            is_correct=is_correct,
            explanation=question.explanation,
            topic=question.topic,
            time_taken=answer.time_taken,
            suggestions=suggestions
        )
        results.append(result.dict())
    
    # Clean up session
    # del quiz_sessions[session_id]
    session.completed = True
    
    score_percentage = (correct_count / len(answers)) * 100 if answers else 0
    
    return {
        "total_questions": len(answers),
        "correct_answers": correct_count,
        "score_percentage": score_percentage,
        "total_time_seconds": total_time,
        "average_time_per_question": total_time / len(answers) if answers else 0,
        "results": results
    }

if __name__ == "__main__":
    import uvicorn
    print("=" * 60)
    print("🧪 Chemistry Avatar API Starting...")
    print("=" * 60)
    print(f"✓ Using model: {GEMINI_MODEL}")
    print("✓ Backend URL: http://localhost:8000")
    print("✓ API Docs: http://localhost:8000/docs")
    print("✓ Health Check: http://localhost:8000/health")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=8000)
