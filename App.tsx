



import React, { useState, useCallback } from 'react';
import * as docx from 'docx';
import saveAs from 'file-saver';
import { GenerationOptions, GeneratedContent, Paragraph, Question, VocabularyItem, QuestionFormat, QuestionType, QuestionTypes } from './types';
import { generateFullPassageAndQuestions, regenerateParagraph, factCheckParagraph, regenerateQuestionAndUpdatePassage } from './services/geminiService';
import { TOPIC_CATEGORIES, GRADES, DIFFICULTIES, WORD_COUNTS } from './constants';
import { SparklesIcon, RefreshIcon, CheckCircleIcon, DownloadIcon, XIcon } from './components/icons';
import LoadingSpinner from './components/LoadingSpinner';

const DIRECT_INPUT_KEY = 'direct-input';
const QUESTION_TYPE_LIST = Object.values(QuestionTypes);

const renderQuestionWithBox = (text: string) => {
    const bogiRegex = /<보기>([\s\S]*?)<\/보기>/;
    const bogiMatch = text.match(bogiRegex);

    if (bogiMatch) {
        const questionPart = text.replace(bogiRegex, '').trim();
        const bogiContent = bogiMatch[1].trim();

        return (
            <span>
                {questionPart}
                <span className="block my-2 p-3 border border-slate-300 bg-slate-100 rounded-md text-sm">
                    <strong>&lt;보기&gt;</strong>
                    <span className="block mt-1 whitespace-pre-wrap">{bogiContent}</span>
                </span>
            </span>
        );
    }
    return text;
};


const App: React.FC = () => {
    const initialMainTopic = Object.keys(TOPIC_CATEGORIES)[0];
    const initialSubCategories = TOPIC_CATEGORIES[initialMainTopic];
    const initialSubTopic = initialSubCategories.length > 0 ? initialSubCategories[0] : DIRECT_INPUT_KEY;
    
    let initialTopic: string;
    if (initialSubTopic === DIRECT_INPUT_KEY) {
        initialTopic = '';
    } else if (initialSubTopic === initialMainTopic) {
        initialTopic = initialMainTopic;
    } else {
        initialTopic = initialSubTopic ? `${initialMainTopic} - ${initialSubTopic}` : initialMainTopic;
    }

    const [options, setOptions] = useState<GenerationOptions>({
        topic: initialTopic,
        grade: 3,
        numParagraphs: 4,
        numQuestions: 3,
        difficulty: 1,
    });
    
    const [mainTopic, setMainTopic] = useState(initialMainTopic);
    const [subTopic, setSubTopic] = useState(initialSubTopic);
    const [customTopic, setCustomTopic] = useState('');

    const [content, setContent] = useState<GeneratedContent | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const [itemLoading, setItemLoading] = useState<{[key: string]: boolean}>({});
    const [regenerateQuestionConfig, setRegenerateQuestionConfig] = useState<{ [key: string]: { questionType: QuestionType } }>({});
    const [factCheckResult, setFactCheckResult] = useState<{ title: string; content: string; originalParagraph: string; } | null>(null);
    const [showAnswers, setShowAnswers] = useState(false);


    const handleMainTopicChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newMainTopic = e.target.value;
        setMainTopic(newMainTopic);
        const newSubCategories = TOPIC_CATEGORIES[newMainTopic];
        
        const newSubTopic = newSubCategories.length > 0 ? newSubCategories[0] : DIRECT_INPUT_KEY;
        setSubTopic(newSubTopic);
        setCustomTopic('');

        let newTopic: string;
        if (newSubTopic === DIRECT_INPUT_KEY) {
            newTopic = '';
        } else if (newSubTopic === newMainTopic) {
            newTopic = newMainTopic;
        } else {
            newTopic = newSubTopic ? `${newMainTopic} - ${newSubTopic}` : newMainTopic;
        }
        setOptions(o => ({ ...o, topic: newTopic }));
    };
    
    const handleSubTopicChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newSubTopic = e.target.value;
        setSubTopic(newSubTopic);
        if (newSubTopic === DIRECT_INPUT_KEY) {
            setOptions(o => ({ ...o, topic: customTopic }));
        } else {
            setCustomTopic('');
            let newTopic: string;
            if (newSubTopic === mainTopic) {
                newTopic = mainTopic;
            } else {
                newTopic = newSubTopic ? `${mainTopic} - ${newSubTopic}` : mainTopic;
            }
            setOptions(o => ({ ...o, topic: newTopic }));
        }
    };

    const handleCustomTopicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newCustomTopic = e.target.value;
        setCustomTopic(newCustomTopic);
        setOptions(o => ({ ...o, topic: newCustomTopic }));
    };


    const handleGenerate = async () => {
        setIsLoading(true);
        setError(null);
        setContent(null);
        setShowAnswers(false);
        try {
            const result = await generateFullPassageAndQuestions(options);
            setContent(result);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRegenerateParagraph = async (paraIndex: number) => {
        if (!content) return;
        const paraId = content.paragraphs[paraIndex].id;
        setItemLoading(prev => ({...prev, [paraId]: true}));
        try {
            const newParagraph = await regenerateParagraph(options, content.paragraphs, paraIndex);
            setContent(prev => {
                if (!prev) return null;
                const newParagraphs = [...prev.paragraphs];
                newParagraphs[paraIndex] = newParagraph;
                return { ...prev, paragraphs: newParagraphs };
            });
        } catch (e: any) {
            alert("문단 재생성에 실패했습니다: " + e.message);
        } finally {
            setItemLoading(prev => ({...prev, [paraId]: false}));
        }
    };
    
    const handleFactCheck = async (paragraph: Paragraph, index: number) => {
        setItemLoading(prev => ({...prev, [`fact-${paragraph.id}`]: true}));
        try {
            const result = await factCheckParagraph(paragraph.content);
            setFactCheckResult({
                title: `문단 ${index + 1} 팩트체크 결과`,
                content: result,
                originalParagraph: paragraph.content,
            });
        } catch (e: any) {
             alert("팩트체크에 실패했습니다: " + e.message);
        } finally {
             setItemLoading(prev => ({...prev, [`fact-${paragraph.id}`]: false}));
        }
    };

    const handleRegenerateQuestion = async (qIndex: number) => {
        if (!content) return;
        const question = content.questions[qIndex];
        const newType = regenerateQuestionConfig[question.id]?.questionType || question.questionType;

        setItemLoading(prev => ({...prev, [question.id]: true}));
        try {
            const { newQuestion, newParagraphs } = await regenerateQuestionAndUpdatePassage(content, qIndex, newType);
            
            setContent(prev => {
                 if (!prev) return null;
                 const newQuestions = [...prev.questions];
                 newQuestions[qIndex] = newQuestion;
                 return { ...prev, questions: newQuestions, paragraphs: newParagraphs };
            });
        } catch (e: any) {
            alert("문제 재생성에 실패했습니다: " + e.message);
        } finally {
            setItemLoading(prev => ({...prev, [question.id]: false}));
        }
    };
    
    const exportToDocx = () => {
        if (!content) return;

        const { Packer, Document, Paragraph: DocxParagraph, TextRun, HeadingLevel, Table, TableCell, TableRow, WidthType, BorderStyle } = docx;

        const createMultilineParagraphs = (text: string) => {
            return text.split('\n').map(line => 
                new DocxParagraph({ 
                    children: [new TextRun(line)],
                    spacing: { after: 200 }
                })
            );
        };

        try {
            const docChildren: any[] = [];

            docChildren.push(new DocxParagraph({
                children: [new TextRun(content.title)],
                heading: HeadingLevel.TITLE,
                spacing: { after: 400 },
            }));

            content.paragraphs.forEach(p => {
                docChildren.push(...createMultilineParagraphs(p.content));
            });

            if (content.vocabulary.length > 0) {
                docChildren.push(new DocxParagraph({ text: "어휘 학습", heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }));
                content.vocabulary.forEach(v => {
                    docChildren.push(new DocxParagraph({
                        children: [
                            new TextRun({ text: v.word, bold: true }),
                            new TextRun({ text: `: ${v.definition}` }),
                        ]
                    }));
                    docChildren.push(new DocxParagraph({
                        children: [
                            new TextRun({ text: `예) ${v.example}`, italics: true })
                        ],
                        spacing: { after: 200 }
                    }));
                });
            }

            if (content.questions.length > 0) {
                docChildren.push(new DocxParagraph({ text: "독해 문제", heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }));
                content.questions.forEach((q, index) => {
                    const bogiRegex = /<보기>([\s\S]*?)<\/보기>/s;
                    const bogiMatch = q.questionText.match(bogiRegex);

                    let questionPart = q.questionText;
                    let bogiContent: string | null = null;

                    if (bogiMatch) {
                        questionPart = q.questionText.replace(bogiRegex, '').trim();
                        bogiContent = bogiMatch[1].trim();
                    }
                    
                    const questionFullText = `${index + 1}. [${q.questionType}] ${questionPart}`;
                    const questionLines = questionFullText.split('\n');
                    const questionTextRuns = questionLines.flatMap((line, idx) => {
                        const run = new TextRun({ text: line, bold: true });
                        if (idx < questionLines.length - 1) {
                            return [run, new TextRun({ break: 1 })];
                        }
                        return [run];
                    });
                    docChildren.push(new DocxParagraph({
                        children: questionTextRuns,
                        spacing: { after: 100 }
                    }));
                    
                    if (bogiContent) {
                        const bogiParagraphs = bogiContent.split('\n').map(line =>
                            new DocxParagraph({ children: [new TextRun(line)], spacing: { after: 100 } })
                        );
    
                        const tableCell = new TableCell({
                            children: [
                                new DocxParagraph({ children: [new TextRun({ text: "<보기>", bold: true })], spacing: { after: 100 } }),
                                ...bogiParagraphs
                            ],
                            shading: {
                                fill: "F1F5F9",
                            },
                            borders: {
                                top: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" },
                                bottom: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" },
                                left: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" },
                                right: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" },
                            },
                            margins: { top: 140, bottom: 140, left: 140, right: 140 },
                        });
    
                        const table = new Table({
                            rows: [ new TableRow({ children: [tableCell] }) ],
                            width: { size: 5000, type: WidthType.PERCENTAGE },
                        });
                        
                        docChildren.push(table);
                    }

                    if (q.format === 'multiple-choice' && q.options) {
                        q.options.forEach((opt, optIndex) => {
                            docChildren.push(new DocxParagraph({
                                children: [ new TextRun(`   ${String.fromCharCode(9312 + optIndex)} ${opt}`) ],
                            }));
                        });
                        docChildren.push(new DocxParagraph({
                            children: [ new TextRun({ text: `   정답: ${q.correctAnswer}`, bold: true, color: "008000" }) ],
                        }));
                    }
                    docChildren.push(new DocxParagraph({ children: [new TextRun('')] }));
                });
            }

            const doc = new Document({
                sections: [{
                    children: docChildren,
                }],
            });

            Packer.toBlob(doc).then(blob => {
                const fileName = `${content.title.replace(/[\s\W]+/g, '_')}.docx`;
                saveAs(blob, fileName);
            }).catch((err: Error) => {
                console.error("Error creating docx blob:", err);
                alert("DOCX 파일 생성 중 오류가 발생했습니다. 개발자 콘솔을 확인해주세요.");
            });

        } catch (err) {
            console.error("Error in exportToDocx function:", err);
            alert("DOCX 내보내기 기능 중 오류가 발생했습니다. 개발자 콘솔을 확인해주세요.");
        }
    };


    return (
        <div className="min-h-screen flex flex-col p-4 sm:p-6 lg:p-8">
            <header className="mb-6">
                <h1 className="text-4xl font-bold text-slate-800 mb-2">문해력 교실(by po)</h1>
                <p className="text-lg text-slate-600">주제, 학년, 난이도를 선택하여 학생 맞춤형 설명문과 문제를 생성하세요.</p>
            </header>

            <div className="bg-white rounded-xl shadow-lg p-6 mb-6 sticky top-4 z-10 border border-slate-200">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 items-end">
                    {/* Controls */}
                    <div className="lg:col-span-2 xl:col-span-2">
                         <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="main-topic" className="block text-sm font-medium text-slate-700 mb-1">주제분류 1</label>
                                <select id="main-topic" value={mainTopic} onChange={handleMainTopicChange} className="w-full p-2 bg-white border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500">
                                    {Object.keys(TOPIC_CATEGORIES).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="sub-topic" className="block text-sm font-medium text-slate-700 mb-1">주제분류 2</label>
                                <select id="sub-topic" value={subTopic} onChange={handleSubTopicChange} className="w-full p-2 bg-white border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500">
                                    {TOPIC_CATEGORIES[mainTopic].map(sub => <option key={sub} value={sub}>{sub}</option>)}
                                    <option value={DIRECT_INPUT_KEY}>직접 입력</option>
                                </select>
                            </div>
                        </div>
                        {subTopic === DIRECT_INPUT_KEY && (
                            <div className="mt-2">
                               <label htmlFor="custom-topic" className="block text-sm font-medium text-slate-700 mb-1">주제 직접 입력</label>
                               <input
                                   type="text"
                                   id="custom-topic"
                                   value={customTopic}
                                   onChange={handleCustomTopicChange}
                                   placeholder="단어 또는 문장으로 주제를 입력하세요"
                                   className="w-full p-2 bg-white border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                                />
                           </div>
                        )}
                    </div>
                    <div>
                        <label htmlFor="grade" className="block text-sm font-medium text-slate-700 mb-1">학년</label>
                        <select id="grade" value={options.grade} onChange={e => setOptions(o => ({ ...o, grade: parseInt(e.target.value) }))} className="w-full p-2 bg-white border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500">
                            {GRADES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="difficulty" className="block text-sm font-medium text-slate-700 mb-1">난이도</label>
                        <select id="difficulty" value={options.difficulty} onChange={e => setOptions(o => ({ ...o, difficulty: parseInt(e.target.value) }))} className="w-full p-2 bg-white border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500">
                             {DIFFICULTIES.map(d => <option key={d.value} value={d.value}>{`${d.label} (${WORD_COUNTS[d.value][options.grade]})`}</option>)}
                        </select>
                    </div>
                     <div className="grid grid-cols-2 gap-2">
                         <div>
                            <label htmlFor="numParagraphs" className="block text-sm font-medium text-slate-700 mb-1">문단</label>
                            <input type="number" id="numParagraphs" min="3" max="7" value={options.numParagraphs} onChange={e => setOptions(o => ({ ...o, numParagraphs: parseInt(e.target.value) }))} className="w-full p-2 bg-white border border-slate-300 rounded-md shadow-sm"/>
                        </div>
                        <div>
                            <label htmlFor="numQuestions" className="block text-sm font-medium text-slate-700 mb-1">문제</label>
                            <input type="number" id="numQuestions" min="0" max="10" value={options.numQuestions} onChange={e => setOptions(o => ({ ...o, numQuestions: parseInt(e.target.value) }))} className="w-full p-2 bg-white border border-slate-300 rounded-md shadow-sm"/>
                        </div>
                    </div>
                    <div className="lg:col-span-2 xl:col-span-1">
                        <button onClick={handleGenerate} disabled={isLoading || (subTopic === DIRECT_INPUT_KEY && !customTopic.trim())} className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-md hover:bg-indigo-700 disabled:bg-indigo-300 transition-colors">
                            <SparklesIcon className="w-5 h-5"/>
                            <span>생성하기</span>
                        </button>
                    </div>
                </div>
            </div>

            {isLoading && <div className="flex justify-center items-center py-20"><LoadingSpinner size="h-16 w-16" /></div>}
            {error && <div className="text-center text-red-500 bg-red-100 p-4 rounded-md">{error}</div>}
            
            {factCheckResult && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4" onClick={() => setFactCheckResult(null)}>
                    <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full relative" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-slate-800">{factCheckResult.title}</h3>
                            <button onClick={() => setFactCheckResult(null)} className="p-1 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors" aria-label="Close">
                                <XIcon className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="mb-4">
                            <h4 className="font-semibold text-slate-600 mb-2">검증 대상 문단:</h4>
                            <p className="bg-gray-100 p-3 rounded-md border text-slate-600 text-sm">{factCheckResult.originalParagraph}</p>
                        </div>

                        <div>
                            <h4 className="font-semibold text-slate-600 mb-2">검증 결과:</h4>
                            <div className="whitespace-pre-wrap bg-slate-50 p-4 rounded-md border text-slate-700 leading-relaxed max-h-[50vh] overflow-y-auto">
                                {factCheckResult.content}
                            </div>
                        </div>
                    </div>
                </div>
            )}


            {content && !isLoading && (
                <main className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-8">
                    <div className="lg:col-span-3">
                        <div className="bg-white rounded-xl shadow-lg p-6 border border-slate-200">
                           <div className="flex justify-between items-start mb-4">
                              <h2 className="text-3xl font-bold">{content.title}</h2>
                               <button onClick={exportToDocx} className="flex items-center gap-2 text-sm bg-blue-500 text-white font-semibold py-2 px-3 rounded-md hover:bg-blue-600 transition-colors">
                                <DownloadIcon/> Docx로 내보내기
                               </button>
                           </div>
                            {content.paragraphs.map((p, i) => (
                                <div key={p.id} className="mb-4 p-4 border rounded-lg bg-slate-50 bg-opacity-[0.7]">
                                    <p className="text-slate-700 leading-relaxed text-lg mb-3">{p.content}</p>
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => handleRegenerateParagraph(i)} disabled={itemLoading[p.id]} className="flex items-center gap-1.5 text-sm py-1 px-2.5 bg-white border border-slate-300 rounded-md hover:bg-slate-100 text-slate-700 disabled:opacity-50 transition-colors">
                                            {itemLoading[p.id] ? <LoadingSpinner size="h-4 w-4"/> : <RefreshIcon className="w-4 h-4" />}
                                            <span>문단 새로고침</span>
                                        </button>
                                        <button onClick={() => handleFactCheck(p, i)} disabled={itemLoading[`fact-${p.id}`]} className="flex items-center gap-1.5 text-sm py-1 px-2.5 bg-white border border-slate-300 rounded-md hover:bg-slate-100 text-slate-700 disabled:opacity-50 transition-colors">
                                            {itemLoading[`fact-${p.id}`] ? <LoadingSpinner size="h-4 w-4"/> : <CheckCircleIcon className="w-4 h-4" />}
                                            <span>팩트체크</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                            <div className="mt-8 pt-6 border-t">
                                <h3 className="text-xl font-bold mb-3">어휘 학습</h3>
                                <ul className="space-y-3">
                                    {content.vocabulary.map(v => (
                                        <li key={v.word}>
                                            <strong className="text-indigo-600">{v.word}</strong>: {v.definition}
                                            <em className="block text-slate-500 ml-2">예) {v.example}</em>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>
                    <div className="lg:col-span-2">
                        <div className="bg-white rounded-xl shadow-lg p-6 border border-slate-200 sticky top-40">
                            <div className="flex justify-between items-center mb-4">
                               <h2 className="text-2xl font-bold">독해 문제</h2>
                               <button onClick={() => setShowAnswers(prev => !prev)} className="text-sm bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-1 px-3 rounded-md transition-colors">
                                   {showAnswers ? '정답 숨기기' : '정답 보기'}
                               </button>
                            </div>
                            {content.questions.map((q, i) => (
                                <div key={q.id} className="mb-6 p-4 border rounded-lg bg-slate-50 bg-opacity-[0.7]">
                                    <p className="font-semibold mb-2">
                                        <span className="text-sm font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full mr-2 align-middle">{q.questionType}</span>
                                        {i + 1}. {renderQuestionWithBox(q.questionText)}
                                    </p>
                                    {q.format === QuestionFormat.MultipleChoice && q.options && (
                                        <ul className="space-y-1 text-slate-600 pl-2">
                                            {q.options.map((opt, optIndex) => (
                                                <li key={optIndex} className={`p-1 rounded transition-colors ${showAnswers && opt === q.correctAnswer ? 'text-green-700 font-bold bg-green-50' : ''}`}>
                                                    {String.fromCharCode(9312 + optIndex)} {opt}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    <div className="mt-3 flex justify-end items-center gap-2">
                                        <div className="flex items-center gap-2">
                                            <label htmlFor={`level-select-${q.id}`} className="text-sm text-slate-600">유형:</label>
                                            <select 
                                                id={`level-select-${q.id}`}
                                                value={regenerateQuestionConfig[q.id]?.questionType || q.questionType}
                                                onChange={(e) => setRegenerateQuestionConfig(prev => ({
                                                    ...prev,
                                                    [q.id]: { ...prev[q.id], questionType: e.target.value as QuestionType }
                                                }))}
                                                className="p-1 border border-slate-300 rounded-md text-sm bg-white focus:ring-indigo-500 focus:border-indigo-500"
                                            >
                                                {QUESTION_TYPE_LIST.map(type => <option key={type} value={type}>{type}</option>
                                            </select>
                                        </div>
                                        <button onClick={() => handleRegenerateQuestion(i)} disabled={itemLoading[q.id]} className="flex items-center gap-1.5 text-sm py-1 px-2.5 bg-white border border-slate-300 rounded-md hover:bg-slate-100 text-slate-700 disabled:opacity-50 transition-colors">
                                             {itemLoading[q.id] ? <LoadingSpinner size="h-4 w-4"/> : <RefreshIcon className="w-4 h-4" />}
                                            <span>문제 새로고침</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </main>
            )}
        </div>
    );
};

export default App;