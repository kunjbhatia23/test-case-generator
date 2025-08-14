import React, { useState, useCallback } from 'react';
import { FileCode2, Github, TestTube, ChevronRight, Loader2, Clipboard, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import './index.css';
// --- MOCK GITHUB API CLIENT ---
// In a real app, this would be a more robust client, possibly in a separate file.
const GITHUB_API_BASE = 'https://api.github.com';

const githubApi = {
    getRepoTree: async (repoUrl, token = null) => {
        const urlRegex = /github\.com\/([^\/]+)\/([^\/]+)/;
        const match = repoUrl.match(urlRegex);
        if (!match) {
            throw new Error("Invalid GitHub repository URL. Format should be: https://github.com/owner/repo");
        }
        const [, owner, repo] = match;
        const apiUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/main?recursive=1`;
        
        const headers = { 'Accept': 'application/vnd.github.v3+json' };
        if (token) {
            headers['Authorization'] = `token ${token}`;
        }

        const response = await fetch(apiUrl, { headers });

        if (response.status === 404) {
             throw new Error("Repository not found. Please check the URL or if the 'main' branch exists.");
        }
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.statusText}`);
        }
        const data = await response.json();
        return { tree: data.tree, owner, repo };
    },

    getFileContent: async (owner, repo, path, token = null) => {
        const apiUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}`;
        const headers = { 'Accept': 'application/vnd.github.v3+json' };
        if (token) {
            headers['Authorization'] = `token ${token}`;
        }
        const response = await fetch(apiUrl, { headers });
        if (!response.ok) {
            throw new Error(`Failed to fetch file content for ${path}`);
        }
        const data = await response.json();
        // Content is base64 encoded, so we need to decode it.
        return atob(data.content);
    }
};


// --- AI SERVICE (using Gemini API) ---
const AiService = {
    generateWithBackoff: async (payload) => {
        // IMPORTANT: In a real local project, you would manage your API key securely.
        // For example, using environment variables (.env file).
        // const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
        // For this example, we'll leave it blank as it was in the original artifact.
        const apiKey = ""; 
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
        
        let delay = 1000;
        for (let i = 0; i < 5; i++) {
            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    if (response.status === 429) { // Throttling
                        await new Promise(resolve => setTimeout(resolve, delay));
                        delay *= 2;
                        continue;
                    }
                    throw new Error(`API Error: ${response.statusText}`);
                }
                
                const result = await response.json();
                if (result.candidates && result.candidates.length > 0 &&
                    result.candidates[0].content && result.candidates[0].content.parts &&
                    result.candidates[0].content.parts.length > 0) {
                    return result.candidates[0].content.parts[0].text;
                } else {
                   throw new Error("Invalid response structure from AI service. The response might be blocked due to safety settings.");
                }
            } catch (error) {
                if (i === 4) throw error;
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
            }
        }
        throw new Error("AI service request failed after multiple retries.");
    },

    generateTestSummaries: async (files) => {
        const fileContents = files.map(file => `
            --- File: ${file.path} ---
            \`\`\`
            ${file.content}
            \`\`\`
        `).join('\n\n');

        const prompt = `
            Analyze the following code files and suggest a list of Jest/React Testing Library test case summaries. 
            For each summary, provide a concise title and a brief description of what the test case will cover.
            Do not generate the code, only the summaries.

            Code Files:
            ${fileContents}
        `;

        const payload = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        summaries: {
                            type: "ARRAY",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    title: { type: "STRING" },
                                    description: { type: "STRING" }
                                },
                                required: ["title", "description"]
                            }
                        }
                    },
                    required: ["summaries"]
                }
            }
        };
        
        const resultText = await AiService.generateWithBackoff(payload);
        return JSON.parse(resultText).summaries;
    },

    generateTestCaseCode: async (files, summary) => {
        const fileContents = files.map(file => `
            --- File: ${file.path} ---
            \`\`\`
            ${file.content}
            \`\`\`
        `).join('\n\n');

        const prompt = `
            Based on the following code files and the selected test case summary, generate the complete test case code using Jest and React Testing Library.
            The code should be well-commented, complete, and ready to be saved in a test file (e.g., Component.test.js).
            Include necessary imports from '@testing-library/react', 'react', and the component itself.

            Code Files:
            ${fileContents}

            Selected Test Case Summary:
            Title: ${summary.title}
            Description: ${summary.description}

            Generate only the code.
        `;
        
        const payload = {
            contents: [{ role: "user", parts: [{ text: prompt }] }]
        };
        
        let code = await AiService.generateWithBackoff(payload);
        // Clean up the response to ensure it's just code
        if (code.startsWith("```javascript")) {
            code = code.substring(13, code.length - 3).trim();
        } else if (code.startsWith("```jsx")) {
            code = code.substring(5, code.length - 3).trim();
        } else if (code.startsWith("```")) {
             code = code.substring(3, code.length - 3).trim();
        }
        return code;
    }
};

// --- UI Components ---

const LoadingSpinner = ({ text }) => (
    <div className="flex flex-col items-center justify-center space-y-4 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-indigo-500" />
        <p className="text-lg font-medium text-gray-600">{text}</p>
    </div>
);

const MessageBox = ({ type, title, message }) => {
    const icons = {
        error: <AlertTriangle className="h-6 w-6 text-red-500" />,
        success: <CheckCircle className="h-6 w-6 text-green-500" />,
    };
    const colors = {
        error: 'bg-red-50 border-red-400 text-red-800',
        success: 'bg-green-50 border-green-400 text-green-800',
    };

    return (
        <div className={`rounded-lg border-l-4 p-4 my-4 ${colors[type]}`}>
            <div className="flex">
                <div className="flex-shrink-0">{icons[type]}</div>
                <div className="ml-3">
                    <p className="text-sm font-bold">{title}</p>
                    <p className="text-sm mt-1">{message}</p>
                </div>
            </div>
        </div>
    );
};

const StepIndicator = ({ currentStep }) => {
    const steps = ["Connect Repo", "Select Files", "Choose Test", "Generate Code"];
    return (
        <nav aria-label="Progress">
            <ol role="list" className="flex items-center">
                {steps.map((step, stepIdx) => (
                    <li key={step} className={`relative ${stepIdx !== steps.length - 1 ? 'pr-8 sm:pr-20' : ''}`}>
                        {stepIdx < currentStep ? (
                            <>
                                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                    <div className="h-0.5 w-full bg-indigo-600" />
                                </div>
                                <a href="#" onClick={e => e.preventDefault()} className="relative flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 hover:bg-indigo-900">
                                    <CheckCircle className="h-5 w-5 text-white" aria-hidden="true" />
                                    <span className="sr-only">{step}</span>
                                </a>
                            </>
                        ) : stepIdx === currentStep ? (
                            <>
                                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                    <div className="h-0.5 w-full bg-gray-200" />
                                </div>
                                <a href="#" onClick={e => e.preventDefault()} className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-indigo-600 bg-white" aria-current="step">
                                    <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" aria-hidden="true" />
                                    <span className="sr-only">{step}</span>
                                </a>
                            </>
                        ) : (
                            <>
                                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                    <div className="h-0.5 w-full bg-gray-200" />
                                </div>
                                <a href="#" onClick={e => e.preventDefault()} className="group relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-gray-300 bg-white hover:border-gray-400">
                                    <span className="h-2.5 w-2.5 rounded-full bg-transparent group-hover:bg-gray-300" aria-hidden="true" />
                                    <span className="sr-only">{step}</span>
                                </a>
                            </>
                        )}
                        <span className="absolute -bottom-6 text-xs font-semibold text-gray-500">{step}</span>
                    </li>
                ))}
            </ol>
        </nav>
    );
};

const RepoInput = ({ onRepoSubmit, isLoading }) => {
    const [repoUrl, setRepoUrl] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onRepoSubmit(repoUrl);
    };

    return (
        <div className="w-full max-w-2xl mx-auto">
             <div className="text-center mb-8">
                <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Test Case Generator</h2>
                <p className="mt-4 text-lg text-gray-600">Enter a public GitHub repository URL to get started.</p>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-center gap-3">
                <div className="relative flex-grow w-full">
                     <Github className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                     <input
                        type="text"
                        value={repoUrl}
                        onChange={(e) => setRepoUrl(e.target.value)}
                        placeholder="For Example -  https://github.com/owner/repo"
                        className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 transition"
                        disabled={isLoading}
                    />
                </div>
                <button
                    type="submit"
                    disabled={isLoading || !repoUrl}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-indigo-600 text-white font-semibold shadow-sm hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition"
                >
                    {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Fetch Files'}
                    <ChevronRight className="h-5 w-5" />
                </button>
            </form>
        </div>
    );
};

const FileExplorer = ({ files, onFileSelectionChange, selectedFiles, onNext, isLoading }) => {
    const handleFileToggle = (path) => {
        const isSelected = selectedFiles.includes(path);
        if (isSelected) {
            onFileSelectionChange(selectedFiles.filter(p => p !== path));
        } else {
            onFileSelectionChange([...selectedFiles, path]);
        }
    };
    
    // Filter for common frontend file types
    const relevantFiles = files.filter(file => 
        /\.(js|jsx|ts|tsx)$/.test(file.path) && !/\.(test|spec)\.(js|jsx|ts|tsx)$/.test(file.path)
    );

    return (
        <div className="w-full">
             <h3 className="text-2xl font-bold text-gray-800 mb-4">Select Files to Analyze</h3>
             <p className="text-gray-600 mb-6">Choose one or more files to generate test cases for. We've filtered for relevant file types.</p>
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm max-h-[50vh] overflow-y-auto">
                <ul role="list" className="divide-y divide-gray-200">
                    {relevantFiles.map(file => (
                        <li key={file.path} className="flex items-center justify-between p-4 hover:bg-gray-50">
                            <div className="flex items-center gap-3">
                                <FileCode2 className="h-6 w-6 text-gray-500" />
                                <span className="font-mono text-sm text-gray-700">{file.path}</span>
                            </div>
                            <input
                                type="checkbox"
                                checked={selectedFiles.includes(file.path)}
                                onChange={() => handleFileToggle(file.path)}
                                className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                            />
                        </li>
                    ))}
                </ul>
            </div>
             <div className="mt-8 flex justify-end">
                <button
                    onClick={onNext}
                    disabled={isLoading || selectedFiles.length === 0}
                    className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-indigo-600 text-white font-semibold shadow-sm hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition"
                >
                    {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Generate Summaries'}
                    <ChevronRight className="h-5 w-5" />
                </button>
            </div>
        </div>
    );
};

const TestCaseSummaryList = ({ summaries, onSelect, onNext, isLoading }) => {
    const [selectedSummary, setSelectedSummary] = useState(null);

    const handleSelectAndNext = () => {
        if(selectedSummary) {
            onSelect(selectedSummary);
            onNext();
        }
    }
    
    return (
        <div className="w-full">
            <h3 className="text-2xl font-bold text-gray-800 mb-4">Select a Test Case</h3>
            <p className="text-gray-600 mb-6">Our AI has suggested the following test cases based on the files you selected. Choose one to generate the code.</p>
            <div className="space-y-4">
                {summaries.map((summary, index) => (
                    <div
                        key={index}
                        onClick={() => setSelectedSummary(summary)}
                        className={`p-5 rounded-lg border-2 transition cursor-pointer ${selectedSummary?.title === summary.title ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white hover:border-gray-400'}`}
                    >
                        <div className="flex items-center">
                            <TestTube className="h-6 w-6 text-indigo-600 mr-4" />
                            <div>
                                <h4 className="font-bold text-lg text-gray-900">{summary.title}</h4>
                                <p className="text-gray-600 mt-1">{summary.description}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
             <div className="mt-8 flex justify-end">
                <button
                    onClick={handleSelectAndNext}
                    disabled={isLoading || !selectedSummary}
                    className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-indigo-600 text-white font-semibold shadow-sm hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition"
                >
                    {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Generate Code'}
                    <ChevronRight className="h-5 w-5" />
                </button>
            </div>
        </div>
    );
};

const GeneratedCodeDisplay = ({ code, onReset }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="w-full">
            <h3 className="text-2xl font-bold text-gray-800 mb-4">Generated Test Case Code</h3>
             <p className="text-gray-600 mb-6">Here is the generated test code. You can copy it and add it to your project.</p>
            <div className="relative bg-gray-900 rounded-lg shadow-lg">
                <div className="flex justify-between items-center px-4 py-2 bg-gray-800 rounded-t-lg">
                    <span className="text-xs font-mono text-gray-400">Generated Test File</span>
                    <button
                        onClick={handleCopy}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-gray-700 text-sm text-white hover:bg-gray-600 transition"
                    >
                        {copied ? <CheckCircle className="h-4 w-4 text-green-400" /> : <Clipboard className="h-4 w-4" />}
                        {copied ? 'Copied!' : 'Copy'}
                    </button>
                </div>
                <pre className="p-5 text-sm text-white overflow-x-auto">
                    <code>{code}</code>
                </pre>
            </div>
            <div className="mt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
                 <button
                    onClick={onReset}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-gray-200 text-gray-800 font-semibold hover:bg-gray-300 transition"
                >
                    <RefreshCw className="h-5 w-5" />
                    Start Over
                </button>
                 <button
                    disabled
                    title="Coming Soon!"
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-green-600 text-white font-semibold shadow-sm disabled:bg-green-300 disabled:cursor-not-allowed"
                >
                    <Github className="h-5 w-5" />
                    Create Pull Request
                </button>
            </div>
        </div>
    );
};


// --- Main App Component ---

export default function App() {
    const [step, setStep] = useState(0); // 0: Repo Input, 1: File Select, 2: Summary Select, 3: Code Display
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    
    const [repoInfo, setRepoInfo] = useState({ owner: '', repo: '' });
    const [repoFiles, setRepoFiles] = useState([]);
    const [selectedFilePaths, setSelectedFilePaths] = useState([]);
    const [selectedFilesWithContent, setSelectedFilesWithContent] = useState([]);
    const [testSummaries, setTestSummaries] = useState([]);
    const [selectedSummary, setSelectedSummary] = useState(null);
    const [generatedCode, setGeneratedCode] = useState('');

    const handleReset = () => {
        setStep(0);
        setIsLoading(false);
        setError(null);
        setRepoInfo({ owner: '', repo: '' });
        setRepoFiles([]);
        setSelectedFilePaths([]);
        setSelectedFilesWithContent([]);
        setTestSummaries([]);
        setSelectedSummary(null);
        setGeneratedCode('');
    };

    const handleRepoSubmit = useCallback(async (repoUrl) => {
        setIsLoading(true);
        setError(null);
        try {
            const { tree, owner, repo } = await githubApi.getRepoTree(repoUrl);
            setRepoFiles(tree);
            setRepoInfo({ owner, repo });
            setStep(1);
        } catch (e) {
            setError({ title: "Failed to fetch repository", message: e.message });
        } finally {
            setIsLoading(false);
        }
    }, []);

    const handleGenerateSummaries = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const filesToFetch = repoFiles.filter(f => selectedFilePaths.includes(f.path));
            const fileContentsPromises = filesToFetch.map(file => 
                githubApi.getFileContent(repoInfo.owner, repoInfo.repo, file.path)
                    .then(content => ({ path: file.path, content }))
            );
            
            const filesWithContent = await Promise.all(fileContentsPromises);
            setSelectedFilesWithContent(filesWithContent);

            const summaries = await AiService.generateTestSummaries(filesWithContent);
            setTestSummaries(summaries);
            setStep(2);
        } catch (e) {
            setError({ title: "Failed to generate summaries", message: e.message });
            setStep(1); // Go back to file selection on error
        } finally {
            setIsLoading(false);
        }
    }, [repoFiles, selectedFilePaths, repoInfo]);

    const handleGenerateCode = useCallback(async () => {
        if (!selectedSummary) return;
        setIsLoading(true);
        setError(null);
        try {
            const code = await AiService.generateTestCaseCode(selectedFilesWithContent, selectedSummary);
            setGeneratedCode(code);
            setStep(3);
        } catch (e) {
            setError({ title: "Failed to generate code", message: e.message });
            setStep(2); // Go back to summary selection on error
        } finally {
            setIsLoading(false);
        }
    }, [selectedFilesWithContent, selectedSummary]);

    const renderCurrentStep = () => {
        if (isLoading) {
            let loadingText = "Loading...";
            if (step === 0) loadingText = "Fetching repository files...";
            if (step === 1) loadingText = "Analyzing files and generating summaries...";
            if (step === 2) loadingText = "Generating test case code...";
            return <LoadingSpinner text={loadingText} />;
        }

        switch (step) {
            case 0:
                return <RepoInput onRepoSubmit={handleRepoSubmit} isLoading={isLoading} />;
            case 1:
                return (
                    <FileExplorer 
                        files={repoFiles} 
                        selectedFiles={selectedFilePaths} 
                        onFileSelectionChange={setSelectedFilePaths}
                        onNext={handleGenerateSummaries}
                        isLoading={isLoading}
                    />
                );
            case 2:
                return (
                    <TestCaseSummaryList 
                        summaries={testSummaries}
                        onSelect={setSelectedSummary}
                        onNext={handleGenerateCode}
                        isLoading={isLoading}
                    />
                );
            case 3:
                return <GeneratedCodeDisplay code={generatedCode} onReset={handleReset} />;
            default:
                return <RepoInput onRepoSubmit={handleRepoSubmit} isLoading={isLoading} />;
        }
    };

    return (
        <div className="bg-gray-50 min-h-screen font-sans">
            <div className="container mx-auto px-4 py-8 sm:py-12">
                <div className="max-w-4xl mx-auto">
                    <div className="mb-12 flex justify-center">
                       <StepIndicator currentStep={step} />
                    </div>
                    
                    {error && <MessageBox type="error" title={error.title} message={error.message} />}

                    <div className="bg-white p-6 sm:p-10 rounded-xl shadow-lg border border-gray-100">
                        {renderCurrentStep()}
                    </div>
                    
                    <footer className="text-center mt-12 text-gray-500 text-sm">
                        <p>Powered by Gemini and the GitHub API. Created with React & Tailwind CSS.</p>
                    </footer>
                </div>
            </div>
        </div>
    );
}