import { GoogleGenAI, Type } from "@google/genai";
import { GenerationOptions, Paragraph, Question, VocabularyItem, QuestionFormat, GeneratedContent, QuestionType, QuestionTypes } from '../types';
import { WORD_COUNTS, PARAGRAPH_RULES } from "../constants";

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const questionTypeEnum = Object.values(QuestionTypes);
const PLACEHOLDER_CHARS = ['㉠', '㉡', '㉢', '㉣', '㉤'];

const questionItemSchema = {
    type: Type.OBJECT,
    properties: {
        questionText: { type: Type.STRING, description: "문제의 질문 내용" },
        questionType: { type: Type.STRING, enum: questionTypeEnum, description: "문제의 사고 유형" },
        options: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "5개의 선택지 배열",
        },
        correctAnswer: { type: Type.STRING, description: "정답에 해당하는 선택지 내용" },
    },
    required: ['questionText', 'questionType', 'options', 'correctAnswer'],
};

const generateContentSchema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING },
        paragraphs: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
        },
        questions: {
            type: Type.ARRAY,
            items: questionItemSchema,
        },
        vocabulary: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    word: { type: Type.STRING },
                    definition: { type: Type.STRING },
                    example: { type: Type.STRING },
                },
                required: ['word', 'definition', 'example'],
            },
        },
    },
    required: ['title', 'paragraphs', 'questions', 'vocabulary'],
};

// FIX: Rewrote function with explicit return to be more robust for the parser.
const getMainTopic = (topic: string): string => {
    return topic.split(' - ')[0];
};

export const generateFullPassageAndQuestions = async (options: GenerationOptions): Promise<GeneratedContent> => {
    const mainTopic = getMainTopic(options.topic);
    const paragraphRule = PARAGRAPH_RULES[mainTopic] || "일반적인 설명문 단락 생성 규칙을 따르세요.";
    const wordCount = WORD_COUNTS[options.difficulty][options.grade];

    const systemInstruction = `You are an expert AI assistant specialized in creating educational reading materials for Korean elementary school students. Your goal is to generate a complete, coherent, and age-appropriate informational passage based on the user's request. Strictly adhere to all instructions. The entire output, including all JSON fields, must be in Korean. Avoid generating content focused on moral or ethical lessons (e.g., 'why you should be nice') unless specifically requested by the user. Focus on factual, informational content across various subjects.`;

    const prompt = `
주제: "${options.topic}"
대상 학년: ${options.grade}학년
난이도: ${options.difficulty} (1~3, 높을수록 어려움)
글자 수: ${wordCount}
문단 수: ${options.numParagraphs}
문제 수: ${options.numQuestions}
문제 형식: 객관식 5지선다형

**생성 지침:**

1.  **제목 (title):** 주제를 잘 나타내는 흥미로운 제목을 한국어로 생성합니다.
2.  **본문 (paragraphs):**
    *   총 ${options.numParagraphs}개의 문단으로 구성된 완결된 설명문을 작성합니다.
    *   **각 문단은 최대 250자를 넘지 않도록 작성합니다.**
    *   대상 학년의 눈높이에 맞는 어휘와 문장 구조를 사용합니다.
    *   글의 '끝' 부분은 전달해야 할 정보가 많을 경우 생략하고 정보 전달에 집중할 수 있습니다.
    *   아래의 **'단락 내용 생성 규칙'**을 반드시 준수하여 문단을 작성하세요.
${paragraphRule}
3.  **문제 (questions):**
    *   본문의 내용을 바탕으로 총 ${options.numQuestions}개의 독해 문제를 **객관식 5지선다형**으로 생성합니다.
    *   각 문제에는 5개의 선택지('options')와 정답('correctAnswer')을 포함해야 합니다.
    *   문제는 아래 7가지 사고 유형 중 다양하게 출제되어야 합니다:
        *   '${QuestionTypes.FACTUAL}', '${QuestionTypes.INFERENTIAL}', '${QuestionTypes.CRITICAL}', '${QuestionTypes.CREATIVE}', '${QuestionTypes.APPLICATION}', '${QuestionTypes.CONJUNCTIVE}', '${QuestionTypes.FILL_IN_BLANK}'
    *   **'${QuestionTypes.APPLICATION}', '${QuestionTypes.CONJUNCTIVE}', '${QuestionTypes.FILL_IN_BLANK}' 유형의 문제 중 하나 이상을 반드시 포함해야 합니다.**
    *   **'${QuestionTypes.CONJUNCTIVE}' 문제 선택지 규칙:** 선택지에 '그래서'와 '그러므로'처럼 의미가 거의 동일하여 정답이 중복될 수 있는 단어들을 함께 제시하지 마세요. 오답 선택지는 문맥과 명확히 관련이 없어야 합니다.
    *   **[매우 중요] 본문 수정 규칙:**
        *   '${QuestionTypes.CONJUNCTIVE}' 또는 '${QuestionTypes.FILL_IN_BLANK}' 문제를 생성할 경우, **반드시 본문(paragraphs)의 해당 위치에 괄호 표시를 직접 삽입해야 합니다.**
        *   괄호 형식은 **(㉠), (㉡), (㉣)...** 순서를 따라야 합니다.
        *   **괄호가 본문에 너무 많아지면 안됩니다.** 만약 '${QuestionTypes.CONJUNCTIVE}'와 '${QuestionTypes.FILL_IN_BLANK}' 문제가 모두 출제된다면, '${QuestionTypes.FILL_IN_BLANK}' 문제는 **괄호 한 개만 요구하는 간단한 문제**로 만들어 주세요.
    *   **[매우 중요] '${QuestionTypes.APPLICATION}' (또는 '전이') 문제 생성 규칙 (사용자 예시 기반 강화):**
        *   '적용' 문제는 본문의 핵심 원리를 **본문에 나오지 않은 새로운 구체적 상황**에 적용하여 해결하는 능력을 평가해야 합니다. 아래에 제시된 성공적인 예시들의 패턴과 품질을 참고하여 문제를 생성하세요.
        *   **성공적인 '적용' 문제의 유형:**
            1.  **개념 연결 (가장 일반적):** <보기> 상황을 가장 잘 설명하는 본문의 핵심 개념을 찾도록 질문합니다. (예: 공유지의 비극, 기저효과, 낙인 이론 등)
            2.  **원인 추론:** <보기> 현상의 원인을 본문의 원리로 설명하도록 질문합니다. (예: 관성, 삼투 현상, 작용-반작용)
            3.  **결과 예측:** <보기> 상황 이후에 벌어질 일을 본문의 원리에 근거하여 예측하도록 질문합니다. (예: 수요와 공급)
            4.  **가치 계산:** 본문의 개념(예: 기회비용)을 <보기> 상황에 적용하여 특정 값을 계산하도록 질문합니다.
        *   **'적용' 문제 생성 2단계 사고 과정:**
            1.  **핵심 원리 파악:** 먼저, 생성된 본문 내용 전체를 분석하여, 학생이 새로운 상황에 적용할 수 있는 핵심적인 **내용, 개념, 또는 과학적 원리**를 정확히 찾아냅니다.
            2.  **새로운 상황 생성:** 다음으로, 파악된 핵심 원리를 적용하여 해결할 수 있는, 학생에게 친숙하고 **완전히 새로운 구체적인 상황**을 \`<보기>\`로 제시합니다. 본문에 이미 나온 예시를 사용해서는 안 됩니다.
        *   **품질 높은 예시 (이와 같은 형식과 논리 구조를 반드시 따르세요):**
            *   **예시 1 (개념 연결 - 사회과학):**
                -   본문 내용: '공유지의 비극' 개념 설명 (공공 자원을 사적 이익을 위해 남용하여 자원이 고갈되는 현상)
                -   questionText: "아래와 같은 마을의 상황을 가장 잘 설명하는 개념은?\\n<보기>\\n마을 주민들이 공동으로 사용하는 목초지가 있었다. 모든 주민은 더 많은 소를 키워 이익을 얻고 싶어 했고, 그 결과 너도나도 경쟁적으로 소의 수를 늘렸다. 결국 목초지는 황폐해져 더 이상 어떤 소도 키울 수 없는 땅이 되어버렸다.\\n</보기>"
            *   **예시 2 (개념 연결 - 경제):**
                -   본문 내용: '기저효과' 개념 설명 (비교 시점 수치가 너무 높거나 낮아 결과가 왜곡되어 보이는 현상)
                -   questionText: "뉴스의 보도가 실제 상황보다 과장되어 보이는 이유는 본문의 어떤 개념으로 설명할 수 있는가?\\n<보기>\\n작년에 최악의 가뭄으로 농작물 수확량이 평년의 절반에 그쳤다. 올해는 평년 수준의 수확량을 회복했지만, 뉴스에서는 \"올해 수확량, 작년 대비 100% 폭증!\"이라고 보도했다.\\n</보기>"
            *   **예시 3 (개념 연결 - 심리):**
                -   본문 내용: '인지 부조화' 개념 설명 (두 가지 생각이 충돌할 때 불편감을 해소하기 위해 행동을 합리화하는 경향)
                -   questionText: "A의 생각은 본문의 어떤 심리 상태를 해소하기 위한 과정으로 볼 수 있는가?\\n<보기>\\nA는 담배가 건강에 매우 해롭다는 사실을 잘 알고 있다. 하지만 담배를 끊을 수 없자, 그는 \"스트레스를 푸는 데는 담배만 한 게 없어. 스트레스가 더 해로울 거야\"라고 생각하며 흡연을 계속했다.\\n</보기>"
            *   **예시 4 (결과 예측 - 경제):**
                -   본문 내용: '수요와 공급의 법칙' 설명
                -   questionText: "본문의 원리에 비추어 볼 때, 아래 상황 이후 시장에서 나타날 현상으로 가장 타당한 것은?\\n<보기>\\n어느 해, 기록적인 풍년으로 배추 생산량이 크게 늘어났다. 하지만 김장철 배추 소비량은 예년과 비슷했다. 그 결과, 시장에 나온 배추가 팔리지 않고 남아도는 상황이 발생했다.\\n</보기>"
            *   **예시 5 (원인 추론 - 과학):**
                -   본문 내용: '관성의 법칙' 설명 (물체는 자신의 운동 상태를 유지하려는 경향)
                -   questionText: "버스가 갑자기 출발할 때 승객들의 몸이 뒤로 쏠리는 이유를 본문의 내용과 관련지어 설명한 것으로 가장 적절한 것은?\\n<보기>\\n버스가 정류장에서 갑자기 출발하자, 버스 안에 서 있던 승객들의 몸이 뒤로 쏠렸다.\\n</보기>"
            *   **예시 6 (개념 연결 - 사회학):**
                -   본문 내용: '낙인 이론' 설명 (사회적 낙인이 개인의 정체성과 행동에 영향을 미치는 현상)
                -   questionText: "선생님에게 '문제아'로 불린 학생에게 나타난 변화를 가장 잘 설명하는 이론은?\\n<보기>\\n한 선생님이 평소 말이 없는 학생에게 '문제아'라는 딱지를 붙이고 계속 그렇게 대했다. 처음에는 그렇지 않았던 학생은 점차 반항적인 행동을 보이기 시작했고, 결국 정말로 수업을 방해하는 학생이 되어버렸다.\\n</보기>"
            *   **예시 7 (개념 연결 - 과학/환경):**
                -   본문 내용: '온실 효과' 설명 (온실가스가 지구의 열을 가두어 기온을 유지하는 현상)
                -   questionText: "비닐하우스의 원리는 지구의 어떤 현상과 가장 유사한가?\\n<보기>\\n겨울철, 비닐하우스 내부는 바깥보다 훨씬 따뜻하다. 이는 비닐이 태양 빛은 통과시키지만, 내부의 지면이 데워진 후 방출하는 열은 밖으로 나가지 못하게 막아주기 때문이다.\\n</보기>"
            *   **예시 8 (개념 연결 - 행동경제학):**
                -   본문 내용: '매몰 비용의 오류' 설명 (이미 투자한 비용이 아까워 합리적이지 않은 결정을 계속하는 현상)
                -   questionText: "A의 의사결정에 영향을 미친 심리적 오류는 무엇인가?\\n<보기>\\nA는 2년 동안 준비해 온 시험에 합격할 가능성이 거의 없다는 것을 알게 되었다. 하지만 그동안 들인 시간과 노력이 아까워서, 더 전망이 좋은 다른 길을 선택하지 못하고 계속 시험 준비를 하고 있다.\\n</보기>"
        *   **'questionText' 필드 및 <보기> 작성 규칙:**
            *   'questionText'는 **(지시문)**과 **(<보기> 블록)** 두 부분으로 구성되며, 줄바꿈 문자(\\n)로 구분됩니다.
            *   \`<보기>\`와 \`</보기>\` 태그로 감싸야 하며, 안에는 질문이 아닌 **상황 설명만** 있어야 합니다.
            *   지시문은 <보기>를 참고하라는 안내("윗글을 바탕으로 할 때", "본문의 원리에 비추어 볼 때" 등)로 시작할 수 있습니다.
            *   **[절대 규칙]** 질문의 지시문 부분에는 '<보기>'라는 단어를 절대 사용하지 마세요. 대신 "다음 상황을...", "아래 상황은..."과 같이 <보기> 안의 내용을 가리키는 다른 표현을 사용하세요. (좋은 예: "아래 상황을 가장 잘 설명하는 개념은?", "A의 행동에 영향을 미친 심리적 오류는 무엇인가?" / 나쁜 예: "<보기>의 상황을 설명하는 개념은?")
        *   **논리적 연결:** 본문의 원리를 이해해야만 <보기> 상황을 분석하고 정답을 찾을 수 있도록 논리적으로 완벽하게 연결되어야 합니다.
    *   생성된 각 문제에 대해 'questionType'을 7가지 유형 중 하나로 정확히 지정해주세요.
4.  **어휘 (vocabulary):**
    *   본문에서 ${options.grade}학년 학생에게 다소 어려울 수 있는 핵심 어휘 3~5개를 선정합니다.
    *   각 어휘에 대해 'word', 'definition', 'example'을 제공합니다.

**출력 형식:**
응답은 반드시 제공된 JSON 스키마를 준수하여야 합니다. 모든 텍스트는 한국어로 작성되어야 합니다.
`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        // FIX: Changed `contents` to a direct string prompt to align with the current API and other calls in the file.
        // The previous format was likely causing a major type error.
        contents: prompt,
        config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: generateContentSchema,
        },
    });

    // FIX: Added .trim() to prevent JSON parsing errors from leading/trailing whitespace.
    const generated = JSON.parse(response.text.trim());

    return {
        title: generated.title,
        paragraphs: generated.paragraphs.map((p: string) => ({ id: crypto.randomUUID(), content: p })),
        questions: generated.questions.map((q: any) => ({ ...q, format: QuestionFormat.MultipleChoice, id: crypto.randomUUID() })),
        vocabulary: generated.vocabulary,
    };
};

export const regenerateParagraph = async (options: GenerationOptions, paragraphs: Paragraph[], paraIndex: number): Promise<Paragraph> => {
    const mainTopic = getMainTopic(options.topic);
    const paragraphRule = PARAGRAPH_RULES[mainTopic] || "일반적인 설명문 단락 생성 규칙을 따르세요.";

    const previousParagraph = paraIndex > 0 ? paragraphs[paraIndex - 1].content : null;
    const nextParagraph = paraIndex < paragraphs.length - 1 ? paragraphs[paraIndex + 1].content : null;

    const prompt = `
주제: "${options.topic}"
대상 학년: ${options.grade}학년

현재 글의 일부는 다음과 같습니다:
${previousParagraph ? `[이전 문단]\n${previousParagraph}\n\n` : ''}
[현재 문단 - 이 문단을 다시 작성해야 합니다.]
${paragraphs[paraIndex].content}

${nextParagraph ? `\n[다음 문단]\n${nextParagraph}` : ''}

**요청:**
'현재 문단'의 내용을, 이전 문단과 다음 문단의 흐름에 자연스럽게 어울리도록 새롭게 다시 작성해주세요.
- **새로 작성하는 문단은 최대 250자를 넘지 않아야 합니다.**
- **만약 원래 문단에 '(㉠)'과 같은 문제용 빈칸이 있었다면, 새로 작성하는 문단에도 내용의 흐름에 맞게 비슷한 종류의 빈칸을 포함시켜 주세요.**
- 대상 학년의 눈높이에 맞춰 쉽고 흥미롭게 서술해야 합니다.
- 아래의 **'단락 내용 생성 규칙'**을 준수해야 합니다.
${paragraphRule}
- 출력은 오직 새로 작성된 문단의 텍스트만 포함해야 합니다. 제목이나 다른 설명은 절대 추가하지 마세요.
`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });

    const newContent = response.text.trim();
    return { id: crypto.randomUUID(), content: newContent };
};

export const factCheckParagraph = async (paragraphContent: string): Promise<string> => {
    const prompt = `
초등학생 교육용으로 작성된 다음 문단의 내용에 대해, 전문가 수준의 심층적인 팩트체크를 수행해주세요.

[검증 대상 문단]
${paragraphContent}

**팩트체크 수행 및 결과 보고 지침:**

1.  **최종 요약 (Summary):**
    *   가장 먼저, 전체 검증 결과를 한 문장으로 명확하게 요약하여 **[최종 요약]** 항목으로 제시해주세요.
    *   예시:
        *   "[최종 요약] 검증 결과, 해당 문단의 내용은 사실에 부합하며 오해의 소지가 없습니다."
        *   "[최종 요약] 검증 결과, '지구 온난화'의 원인 설명 부분에서 일부 부정확한 정보가 발견되었습니다."
        *   "[최종 요약] 검증 결과, 사실 관계는 맞으나 초등학생에게 오해를 유발할 수 있는 표현이 일부 확인되었습니다."

2.  **상세 분석 (Details):**
    *   **문제가 없는 경우:** 최종 요약 외에 추가적인 설명은 필요 없습니다.
    *   **문제가 있는 경우:** 최종 요약 아래에, 다음 형식에 따라 문제가 되는 각 항목을 상세히 분석해주세요.
        *   **[지적 사항]**: 문제가 되는 원본 문장을 그대로 인용합니다.
        *   **[상세 설명]**: 해당 내용이 왜 사실과 다른지, 혹은 초등학생에게 어떤 오해를 불러일으킬 수 있는지 교육적 관점에서 구체적이고 상세하게 설명합니다.
        *   **[대안 제시]**: 학생들이 더 쉽게 이해하고 정확한 지식을 습득할 수 있는 교육적인 대안 표현이나 설명을 제시합니다.
        *   **[근거]**: 수정 제안에 대한 객관적인 근거 또는 출처를 제시합니다. (Google 검색 결과 활용)

**출력 언어:** 모든 답변은 한국어로 작성되어야 합니다.
`;
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }],
        },
    });

    let resultText = response.text;
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;

    if (groundingChunks && groundingChunks.length > 0) {
        const sources = groundingChunks
            .map((chunk: any) => chunk.web)
            .filter((web: any) => web && web.uri && web.title);
        
        const uniqueSources = Array.from(new Map(sources.map((item: any) => [item.uri, item])).values());

        if (uniqueSources.length > 0) {
            resultText += '\n\n---\n**참고 자료:**\n';
            uniqueSources.forEach((source: any, index: number) => {
                resultText += `${index + 1}. ${source.title} (${source.uri})\n`;
            });
        }
    }

    return resultText;
};

export const regenerateQuestionAndUpdatePassage = async (
    passage: GeneratedContent,
    questionIndex: number,
    newType: QuestionType
): Promise<{ newQuestion: Question; newParagraphs: Paragraph[] }> => {
    
    const originalQuestion = passage.questions[questionIndex];
    const originalParagraphs = passage.paragraphs;

    // Find the specific placeholder in the original question, if any.
    const placeholderRegex = new RegExp(`\\((${PLACEHOLDER_CHARS.join('|')})\\)`);
    const placeholderMatch = originalQuestion.questionText.match(placeholderRegex);
    const originalPlaceholder = placeholderMatch ? placeholderMatch[0] : null;

    const regenerationSchema = {
        type: Type.OBJECT,
        properties: {
            newQuestion: questionItemSchema,
            updatedParagraphs: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "수정되었거나 수정되지 않은 전체 본문 문단들의 배열",
            },
        },
        required: ['newQuestion', 'updatedParagraphs'],
    };

    const prompt = `
주어진 지문과 문제 세트를 바탕으로, 지정된 문제를 새로운 유형으로 다시 생성하고 필요 시 지문을 수정합니다.

[전체 지문]
${originalParagraphs.map(p => p.content).join('\n\n')}

[기존 문제 정보]
- 문제 번호: ${questionIndex + 1}
- 기존 문제 내용: "${originalQuestion.questionText}"
- 기존 문제 유형: "${originalQuestion.questionType}"
${originalPlaceholder ? `- 기존 문제 관련 괄호: ${originalPlaceholder}` : ''}

**요청:**
${questionIndex + 1}번 문제를 **"${newType}"** 유형으로 변경해주세요. 이 작업은 다음 두 단계로 이루어집니다.

1.  **문제 재생성:**
    *   "${newType}" 유형의 특징에 맞는 새로운 문제를 **객관식 5지선다형**으로 생성합니다.
    *   **'${QuestionTypes.CONJUNCTIVE}' 문제 선택지 규칙:** 선택지에 '그래서'와 '그러므로'처럼 의미가 거의 동일하여 정답이 중복될 수 있는 단어들을 함께 제시하지 마세요. 오답 선택지는 문맥과 명확히 관련이 없어야 합니다.
    *   **[매우 중요] '${QuestionTypes.APPLICATION}' (또는 '전이') 문제 생성 규칙 (사용자 예시 기반 강화):**
        *   '적용' 문제는 본문의 핵심 원리를 **본문에 나오지 않은 새로운 구체적 상황**에 적용하여 해결하는 능력을 평가해야 합니다. 아래에 제시된 성공적인 예시들의 패턴과 품질을 참고하여 문제를 생성하세요.
        *   **성공적인 '적용' 문제의 유형:**
            1.  **개념 연결 (가장 일반적):** <보기> 상황을 가장 잘 설명하는 본문의 핵심 개념을 찾도록 질문합니다. (예: 공유지의 비극, 기저효과, 낙인 이론 등)
            2.  **원인 추론:** <보기> 현상의 원인을 본문의 원리로 설명하도록 질문합니다. (예: 관성, 삼투 현상, 작용-반작용)
            3.  **결과 예측:** <보기> 상황 이후에 벌어질 일을 본문의 원리에 근거하여 예측하도록 질문합니다. (예: 수요와 공급)
            4.  **가치 계산:** 본문의 개념(예: 기회비용)을 <보기> 상황에 적용하여 특정 값을 계산하도록 질문합니다.
        *   **'적용' 문제 생성 2단계 사고 과정:**
            1.  **핵심 원리 파악:** 먼저, 생성된 본문 내용 전체를 분석하여, 학생이 새로운 상황에 적용할 수 있는 핵심적인 **내용, 개념, 또는 과학적 원리**를 정확히 찾아냅니다.
            2.  **새로운 상황 생성:** 다음으로, 파악된 핵심 원리를 적용하여 해결할 수 있는, 학생에게 친숙하고 **완전히 새로운 구체적인 상황**을 \`<보기>\`로 제시합니다. 본문에 이미 나온 예시를 사용해서는 안 됩니다.
        *   **품질 높은 예시 (이와 같은 형식과 논리 구조를 반드시 따르세요):**
            *   **예시 1 (개념 연결 - 사회과학):**
                -   본문 내용: '공유지의 비극' 개념 설명 (공공 자원을 사적 이익을 위해 남용하여 자원이 고갈되는 현상)
                -   questionText: "아래와 같은 마을의 상황을 가장 잘 설명하는 개념은?\\n<보기>\\n마을 주민들이 공동으로 사용하는 목초지가 있었다. 모든 주민은 더 많은 소를 키워 이익을 얻고 싶어 했고, 그 결과 너도나도 경쟁적으로 소의 수를 늘렸다. 결국 목초지는 황폐해져 더 이상 어떤 소도 키울 수 없는 땅이 되어버렸다.\\n</보기>"
            *   **예시 2 (개념 연결 - 경제):**
                -   본문 내용: '기저효과' 개념 설명 (비교 시점 수치가 너무 높거나 낮아 결과가 왜곡되어 보이는 현상)
                -   questionText: "뉴스의 보도가 실제 상황보다 과장되어 보이는 이유는 본문의 어떤 개념으로 설명할 수 있는가?\\n<보기>\\n작년에 최악의 가뭄으로 농작물 수확량이 평년의 절반에 그쳤다. 올해는 평년 수준의 수확량을 회복했지만, 뉴스에서는 \"올해 수확량, 작년 대비 100% 폭증!\"이라고 보도했다.\\n</보기>"
            *   **예시 3 (개념 연결 - 심리):**
                -   본문 내용: '인지 부조화' 개념 설명 (두 가지 생각이 충돌할 때 불편감을 해소하기 위해 행동을 합리화하는 경향)
                -   questionText: "A의 생각은 본문의 어떤 심리 상태를 해소하기 위한 과정으로 볼 수 있는가?\\n<보기>\\nA는 담배가 건강에 매우 해롭다는 사실을 잘 알고 있다. 하지만 담배를 끊을 수 없자, 그는 \"스트레스를 푸는 데는 담배만 한 게 없어. 스트레스가 더 해로울 거야\"라고 생각하며 흡연을 계속했다.\\n</보기>"
            *   **예시 4 (결과 예측 - 경제):**
                -   본문 내용: '수요와 공급의 법칙' 설명
                -   questionText: "본문의 원리에 비추어 볼 때, 아래 상황 이후 시장에서 나타날 현상으로 가장 타당한 것은?\\n<보기>\\n어느 해, 기록적인 풍년으로 배추 생산량이 크게 늘어났다. 하지만 김장철 배추 소비량은 예년과 비슷했다. 그 결과, 시장에 나온 배추가 팔리지 않고 남아도는 상황이 발생했다.\\n</보기>"
            *   **예시 5 (원인 추론 - 과학):**
                -   본문 내용: '관성의 법칙' 설명 (물체는 자신의 운동 상태를 유지하려는 경향)
                -   questionText: "버스가 갑자기 출발할 때 승객들의 몸이 뒤로 쏠리는 이유를 본문의 내용과 관련지어 설명한 것으로 가장 적절한 것은?\\n<보기>\\n버스가 정류장에서 갑자기 출발하자, 버스 안에 서 있던 승객들의 몸이 뒤로 쏠렸다.\\n</보기>"
            *   **예시 6 (개념 연결 - 사회학):**
                -   본문 내용: '낙인 이론' 설명 (사회적 낙인이 개인의 정체성과 행동에 영향을 미치는 현상)
                -   questionText: "선생님에게 '문제아'로 불린 학생에게 나타난 변화를 가장 잘 설명하는 이론은?\\n<보기>\\n한 선생님이 평소 말이 없는 학생에게 '문제아'라는 딱지를 붙이고 계속 그렇게 대했다. 처음에는 그렇지 않았던 학생은 점차 반항적인 행동을 보이기 시작했고, 결국 정말로 수업을 방해하는 학생이 되어버렸다.\\n</보기>"
            *   **예시 7 (개념 연결 - 과학/환경):**
                -   본문 내용: '온실 효과' 설명 (온실가스가 지구의 열을 가두어 기온을 유지하는 현상)
                -   questionText: "비닐하우스의 원리는 지구의 어떤 현상과 가장 유사한가?\\n<보기>\\n겨울철, 비닐하우스 내부는 바깥보다 훨씬 따뜻하다. 이는 비닐이 태양 빛은 통과시키지만, 내부의 지면이 데워진 후 방출하는 열은 밖으로 나가지 못하게 막아주기 때문이다.\\n</보기>"
            *   **예시 8 (개념 연결 - 행동경제학):**
                -   본문 내용: '매몰 비용의 오류' 설명 (이미 투자한 비용이 아까워 합리적이지 않은 결정을 계속하는 현상)
                -   questionText: "A의 의사결정에 영향을 미친 심리적 오류는 무엇인가?\\n<보기>\\nA는 2년 동안 준비해 온 시험에 합격할 가능성이 거의 없다는 것을 알게 되었다. 하지만 그동안 들인 시간과 노력이 아까워서, 더 전망이 좋은 다른 길을 선택하지 못하고 계속 시험 준비를 하고 있다.\\n</보기>"
        *   **'questionText' 필드 및 <보기> 작성 규칙:**
            *   'questionText'는 **(지시문)**과 **(<보기> 블록)** 두 부분으로 구성되며, 줄바꿈 문자(\\n)로 구분됩니다.
            *   \`<보기>\`와 \`</보기>\` 태그로 감싸야 하며, 안에는 질문이 아닌 **상황 설명만** 있어야 합니다.
            *   지시문은 <보기>를 참고하라는 안내("윗글을 바탕으로 할 때", "본문의 원리에 비추어 볼 때" 등)로 시작할 수 있습니다.
            *   **[절대 규칙]** 질문의 지시문 부분에는 '<보기>'라는 단어를 절대 사용하지 마세요. 대신 "다음 상황을...", "아래 상황은..."과 같이 <보기> 안의 내용을 가리키는 다른 표현을 사용하세요. (좋은 예: "아래 상황을 가장 잘 설명하는 개념은?", "A의 행동에 영향을 미친 심리적 오류는 무엇인가?" / 나쁜 예: "<보기>의 상황을 설명하는 개념은?")
        *   **논리적 연결:** 본문의 원리를 이해해야만 <보기> 상황을 분석하고 정답을 찾을 수 있도록 논리적으로 완벽하게 연결되어야 합니다.
2.  **지문 수정 (필요 시):**
    *   **만약 '${newType}' 유형이 '${QuestionTypes.CONJUNCTIVE}' 또는 '${QuestionTypes.FILL_IN_BLANK}'이라면,** 새로운 괄호(예: (㉠))를 지문의 가장 적절한 위치에 삽입해야 합니다.
    *   **만약 기존 문제 유형이 '${QuestionTypes.CONJUNCTIVE}' 또는 '${QuestionTypes.FILL_IN_BLANK}'이었고, 새로운 유형은 그것이 아니라면,** 기존에 있던 괄호(${originalPlaceholder})를 지문에서 제거해야 합니다.
    *   이외의 경우, 지문은 수정할 필요가 없습니다.

**출력 형식:**
응답은 반드시 제공된 JSON 스키마(newQuestion, updatedParagraphs)를 준수하여야 합니다. 모든 텍스트는 한국어로 작성되어야 합니다. 'updatedParagraphs' 필드에는 수정 여부와 관계없이 **전체 문단**을 배열 형태로 반환해야 합니다.
`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: regenerationSchema,
        },
    });

    const result = JSON.parse(response.text.trim());
    
    const newQuestion: Question = {
        ...result.newQuestion,
        id: crypto.randomUUID(),
        format: QuestionFormat.MultipleChoice,
    };

    const newParagraphs: Paragraph[] = result.updatedParagraphs.map((p: string, index: number) => ({
        id: originalParagraphs[index].id,
        content: p,
    }));

    // If a paragraph was modified, generate a new ID for it to ensure React re-renders.
    originalParagraphs.forEach((origP, index) => {
        if (origP.content !== newParagraphs[index].content) {
            newParagraphs[index].id = crypto.randomUUID();
        }
    });

    return { newQuestion, newParagraphs };
};