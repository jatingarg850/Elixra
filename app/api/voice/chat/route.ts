import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { RtcTokenBuilder } from 'agora-token';

const AGORA_BASE_URL = 'https://api.agora.io/api/conversational-ai-agent/v2';

interface StartVoiceChatRequest {
  userProfile?: Record<string, any>;
}

interface StopVoiceChatRequest {
  agentId: string;
}

function getAgoraHeaders(): Record<string, string> {
  const customerId = (process.env.AGORA_CUSTOMER_ID || '').trim();
  const customerSecret = (process.env.AGORA_CUSTOMER_SECRET || '').trim();
  // Safe base64 encoding for both Node and Edge environments
  const credentialsString = `${customerId}:${customerSecret}`;
  const credentials = typeof Buffer !== 'undefined'
    ? Buffer.from(credentialsString).toString('base64')
    : btoa(credentialsString);

  return {
    'Authorization': `Basic ${credentials}`,
    'Content-Type': 'application/json'
  };
}

// Generate RTC token using Agora's official token builder
function generateRtcToken(channelName: string, uid: number): string {
  try {
    const appId = (process.env.AGORA_APP_ID || '').trim();
    const appCertificate = (process.env.AGORA_APP_CERTIFICATE || '').trim();

    if (!appId || !appCertificate) {
      console.error('Missing Agora credentials');
      return '';
    }

    // Token expires in 24 hours
    const expirationTimeInSeconds = 3600 * 24;

    // Use Agora's official token builder
    // RtcRole: 1 = PUBLISHER, 2 = SUBSCRIBER
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      1, // PUBLISHER role
      expirationTimeInSeconds,
      expirationTimeInSeconds // privilegeExpiredTs
    );

    console.log('Generated RTC token for channel:', channelName, 'uid:', uid);
    console.log('Token generated successfully');
    return token;
  } catch (error) {
    console.error('Error generating RTC token:', error);
    return '';
  }
}

function buildSystemMessage(userProfile?: Record<string, any>): string {
  const baseMessage = `You are a ERA [elixra Reactive Assisstance] AI Voice Assistant, an intelligent conversational guide for chemistry and science learning.
Your role is to help students with:

1. Chemistry Concepts: Explain molecular structures, bonding, reactions, and spectroscopy
2. Lab Guidance: Provide virtual lab experiment guidance and safety tips
3. Problem Solving: Help solve chemistry problems step-by-step
4. Learning Support: Suggest resources and explain difficult concepts
5. Quiz Preparation: Help prepare for chemistry assessments

Guidelines:
- Be encouraging, clear, and educational
- Provide accurate scientific information
- Ask clarifying questions when needed
- Keep responses concise but informative
- Use simple language for complex concepts
- Adapt explanations to the student's level`;

  if (userProfile) {
    let context = '\n\nStudent Context:';
    if (userProfile.level) context += `\n- Level: ${userProfile.level}`;
    if (userProfile.topic) context += `\n- Current Topic: ${userProfile.topic}`;
    if (userProfile.goals) context += `\n- Learning Goals: ${userProfile.goals}`;
    return baseMessage + context;
  }

  return baseMessage;
}

async function createAgent(
  channelName: string,
  token: string,
  agentUid: string,
  userUid: string,
  userProfile?: Record<string, any>
): Promise<any> {
  const systemMessage = buildSystemMessage(userProfile);
  const agentName = `voicechat_agent_${Date.now()}`;

  const payload = {
    name: agentName,
    properties: {
      channel: channelName,
      token: token,
      agent_rtc_uid: agentUid,
      remote_rtc_uids: [userUid],
      idle_timeout: 300,
      llm: {
        url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${(process.env.AGORA_LLM_API_KEY || '').trim()}`,
        system_messages: [
          {
            parts: [{ text: systemMessage }],
            role: 'system'
          }
        ],
        max_history: 32,
        greeting_message: "Hello! I'm your AI Chemistry Assistant. I'm here to help you learn chemistry and science. What would you like to explore today?",
        greeting_timeout: 5,
        failure_message: "I apologize, I'm having trouble processing that. Could you please rephrase your question?",
        style: 'gemini',
        ignore_empty: false,
        params: {
          model: 'gemini-2.5-flash'
        }
      },
      tts: {
        vendor: 'cartesia',
        params: {
          api_key: (process.env.AGORA_TTS_API_KEY || '').trim(),
          model_id: (process.env.AGORA_TTS_MODEL_ID || 'sonic-3').trim(),
          voice: {
            mode: 'id',
            id: (process.env.AGORA_TTS_VOICE_ID || '').trim()
          },
          output_format: {
            container: 'raw',
            sample_rate: 16000
          },
          language: 'en'
        }
      },
      asr: {
        language: (process.env.AGORA_ASR_LANGUAGE || 'en-US').trim(),
        vendor: (process.env.AGORA_ASR_VENDOR || 'ares').trim(),
        params: {}
      },
      turn_detection: {
        mode: 'default',
        config: {
          speech_threshold: 0.5,
          start_of_speech: {
            mode: 'vad',
            vad_config: {
              interrupt_duration_ms: 160,
              speaking_interrupt_duration_ms: 160,
              prefix_padding_ms: 800
            }
          },
          end_of_speech: {
            mode: 'semantic',
            semantic_config: {
              silence_duration_ms: 320,
              max_wait_ms: 3000
            }
          }
        }
      },
      advanced_features: {
        enable_rtm: true,
        enable_aivad: false
      },
      parameters: {
        silence_config: {
          timeout_ms: 30000,
          action: 'speak',
          content: 'Are you still there? Feel free to ask me anything about chemistry or science.'
        },
        farewell_config: {
          graceful_enabled: true,
          graceful_timeout_seconds: 30
        },
        data_channel: 'rtm',
        enable_metrics: true,
        enable_error_message: true
      }
    }
  };

  const appId = (process.env.AGORA_APP_ID || '').trim();
  const url = `${AGORA_BASE_URL}/projects/${appId}/join`;

  const response = await fetch(url, {
    method: 'POST',
    headers: getAgoraHeaders(),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('=== Agent creation failed ===');
    console.error('Status:', response.status);
    console.error('Error:', error);
    throw new Error(`Failed to create agent: ${error}`);
  }

  const result = await response.json();
  return result;
}

async function stopAgent(agentId: string): Promise<any> {
  const appId = (process.env.AGORA_APP_ID || '').trim();
  const url = `${AGORA_BASE_URL}/projects/${appId}/agents/${agentId}/leave`;

  const response = await fetch(url, {
    method: 'POST',
    headers: getAgoraHeaders()
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to stop agent: ${error}`);
  }

  return response.json();
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const action = request.nextUrl.searchParams.get('action');

    if (action === 'start') {
      const { userProfile } = body as StartVoiceChatRequest;
      const timestamp = Date.now();
      const rawUserId = (session.user as any).id || (session.user as any).email || 'user';
      // Sanitize user ID to contain only alphanumeric characters to avoid any Agora channel name constraints
      const safeUserId = String(rawUserId).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30);

      const channelName = `vc_${safeUserId}_${timestamp}`;
      const userUid = 1000 + (Math.abs(String(rawUserId).charCodeAt(0)) % 9000);
      const agentUid = 2000 + (Math.abs(channelName.charCodeAt(0)) % 9000);

      const userToken = generateRtcToken(channelName, userUid);
      const agentToken = generateRtcToken(channelName, agentUid);

      if (!userToken || !agentToken) {
        console.error('Failed to generate RTC tokens');
        return NextResponse.json(
          { error: 'Failed to generate authentication tokens' },
          { status: 500 }
        );
      }

      const enhancedProfile = {
        ...userProfile,
        user_id: rawUserId,
        email: (session.user as any).email
      };

      const agentResult = await createAgent(
        channelName,
        agentToken,
        String(agentUid),
        String(userUid),
        enhancedProfile
      );

      return NextResponse.json({
        success: true,
        data: {
          channel_name: channelName,
          user_token: userToken,
          user_uid: String(userUid),
          agent_id: agentResult.agent_id,
          agent_uid: String(agentUid),
          status: agentResult.status,
          created_at: agentResult.create_ts
        }
      });
    } else if (action === 'stop') {
      const { agentId } = body as StopVoiceChatRequest;
      const result = await stopAgent(agentId);

      return NextResponse.json({
        success: true,
        data: result
      });
    } else {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Voice chat error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const appId = process.env.AGORA_APP_ID;

    return NextResponse.json({
      success: true,
      data: {
        app_id: appId,
        features: {
          voice_chat: true,
          real_time_response: true,
          context_aware: true,
          chemistry_guidance: true
        }
      }
    });
  } catch (error) {
    console.error('Config error:', error);
    return NextResponse.json(
      { error: 'Failed to get config' },
      { status: 500 }
    );
  }
}
