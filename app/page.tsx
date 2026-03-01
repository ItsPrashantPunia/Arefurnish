'use client';

import React, { useState, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { GoogleGenAI } from '@google/genai';
import { UploadCloud, Image as ImageIcon, Sparkles, Loader2, RefreshCw, Download, Check, X } from 'lucide-react';
import CompareSlider from '@/components/CompareSlider';
import ChatInterface from '@/components/ChatInterface';

const STYLES = [
  'Mid-Century Modern',
  'Scandinavian',
  'Industrial',
  'Bohemian',
  'Minimalist',
  'Coastal',
  'Farmhouse',
];

export default function Home() {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<string>(STYLES[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'model'; content: string }[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [picsRemaining, setPicsRemaining] = useState(10);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);

  const handleDownload = () => {
    if (!generatedImage) return;
    const link = document.createElement('a');
    link.href = generatedImage;
    link.download = `arefurnish-${selectedStyle.toLowerCase().replace(/\s+/g, '-')}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const aiRef = useRef<GoogleGenAI | null>(null);

  const getAI = () => {
    if (!aiRef.current) {
      aiRef.current = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });
    }
    return aiRef.current;
  };

  const generateDesign = async (style: string, customPrompt?: string, imgData?: string) => {
    const sourceImage = imgData || originalImage;
    if (!sourceImage) return;
    setIsGenerating(true);
    setSelectedStyle(style);

    try {
      const ai = getAI();
      const base64Data = sourceImage.split(',')[1];
      const mimeType = sourceImage.match(/data:(.*?);/)?.[1] || 'image/jpeg';

      const prompt = customPrompt || `Redesign this room in a ${style} style. Maintain the basic layout and structure of the room, but update the furniture, colors, and decor to match the ${style} aesthetic. Make it look highly realistic and professional.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            },
            {
              text: prompt,
            },
          ],
        },
      });

      let newImageUrl = null;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          newImageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }

      if (newImageUrl) {
        setGeneratedImage(newImageUrl);
        if (!customPrompt) {
          setMessages([
            {
              role: 'model',
              content: `I've reimagined your space in a **${style}** style! How do you like it? You can ask me to tweak specific elements, change colors, or find shoppable links for items you see.`,
            }
          ]);
        }
      } else {
        throw new Error("No image generated");
      }
    } catch (error) {
      console.error('Error generating image:', error);
      alert('Failed to generate image. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const onDrop = (acceptedFiles: File[]) => {
    if (picsRemaining <= 0) {
      setIsPricingModalOpen(true);
      return;
    }

    const file = acceptedFiles[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const imgData = e.target?.result as string;
        setOriginalImage(imgData);
        setGeneratedImage(null);
        setMessages([]);
        setPicsRemaining(prev => prev - 1);
        // Automatically generate the first design
        generateDesign(STYLES[0], undefined, imgData);
      };
      reader.readAsDataURL(file);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    maxFiles: 1,
  });

  const handleSendMessage = async (message: string) => {
    if (!generatedImage || !originalImage) return;
    
    const newMessages = [...messages, { role: 'user' as const, content: message }];
    setMessages(newMessages);
    setIsChatLoading(true);

    try {
      const ai = getAI();
      
      // Check if the user is asking to modify the image (e.g., "make the rug blue", "add a plant")
      // We use gemini-3.1-pro-preview to decide if it's an image edit request or a chat response.
      const intentPrompt = `
        User message: "${message}"
        Current style: ${selectedStyle}
        
        Is the user asking to modify the visual design of the room (e.g., changing colors, adding/removing items, changing lighting)? 
        Reply with exactly "EDIT" if yes, or "CHAT" if they are just asking a question, asking for links, or discussing the design without requesting a new image.
      `;

      const intentResponse = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: intentPrompt,
      });

      const intent = intentResponse.text?.trim().toUpperCase();

      if (intent?.includes('EDIT')) {
        // It's an edit request. Use gemini-2.5-flash-image to edit the generated image.
        setMessages(prev => [...prev, { role: 'model', content: 'Sure, I am updating the design for you...' }]);
        
        const base64Data = generatedImage.split(',')[1];
        const mimeType = generatedImage.match(/data:(.*?);/)?.[1] || 'image/jpeg';

        const editResponse = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: mimeType,
                },
              },
              {
                text: `Modify this room design: ${message}. Keep the overall ${selectedStyle} style and layout intact.`,
              },
            ],
          },
        });

        let newImageUrl = null;
        for (const part of editResponse.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            newImageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            break;
          }
        }

        if (newImageUrl) {
          setGeneratedImage(newImageUrl);
          setMessages(prev => [
            ...prev.slice(0, -1), // Remove the "updating..." message
            { role: 'model', content: `I've updated the design based on your request: "${message}". What do you think?` }
          ]);
        } else {
          throw new Error("No image generated during edit");
        }

      } else {
        // It's a chat request. Use gemini-3.1-pro-preview to answer.
        const chatPrompt = `
          You are an expert AI interior design consultant. 
          The user has uploaded a photo of their room and you have redesigned it in a ${selectedStyle} style.
          
          Conversation history:
          ${newMessages.map(m => `${m.role === 'user' ? 'User' : 'You'}: ${m.content}`).join('\n')}
          
          Respond to the user's last message. If they ask for shoppable links, provide realistic markdown links to general search queries (e.g., [Mid-Century Modern Blue Rug](https://www.google.com/search?q=mid+century+modern+blue+rug)). Keep your response helpful, concise, and professional.
        `;

        const chatResponse = await ai.models.generateContent({
          model: 'gemini-3.1-pro-preview',
          contents: chatPrompt,
        });

        setMessages(prev => [...prev, { role: 'model', content: chatResponse.text || 'Sorry, I could not process that.' }]);
      }

    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { role: 'model', content: 'Sorry, I encountered an error processing your request.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
              <Sparkles className="text-white" size={18} />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Arefurnish</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-sm font-medium text-zinc-600 bg-zinc-100 px-3 py-1.5 rounded-full">
              <span className={picsRemaining <= 3 ? 'text-rose-600' : ''}>
                {picsRemaining} pics left
              </span>
              <button 
                onClick={() => setIsPricingModalOpen(true)}
                className="text-indigo-600 hover:text-indigo-700 underline decoration-indigo-300 underline-offset-2"
              >
                Upgrade
              </button>
            </div>
            
            {originalImage && (
              <button 
                onClick={() => {
                  setOriginalImage(null);
                  setGeneratedImage(null);
                  setMessages([]);
                }}
                className="text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors flex items-center gap-2"
              >
                <RefreshCw size={16} />
                <span className="hidden sm:inline">Start Over</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!originalImage ? (
          // Upload State
          <div className="max-w-2xl mx-auto mt-12">
            <div className="text-center mb-8">
              <h2 className="text-4xl font-bold tracking-tight mb-4">Reimagine your space</h2>
              <p className="text-lg text-zinc-500">
                Upload a photo of your room and let our AI consultant redesign it in seconds.
              </p>
            </div>

            <div 
              {...getRootProps()} 
              className={`border-2 border-dashed rounded-3xl p-12 text-center cursor-pointer transition-all duration-200 ease-in-out
                ${isDragActive ? 'border-indigo-500 bg-indigo-50/50' : 'border-zinc-300 bg-white hover:border-zinc-400 hover:bg-zinc-50'}
              `}
            >
              <input {...getInputProps()} />
              <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <UploadCloud className="text-zinc-500" size={32} />
              </div>
              <h3 className="text-xl font-medium mb-2">Click or drag photo here</h3>
              <p className="text-sm text-zinc-500">
                High-resolution, well-lit photos work best.
              </p>
            </div>
          </div>
        ) : (
          // Workspace State
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Visualization & Styles */}
            <div className="lg:col-span-2 space-y-6">
              {/* Style Selector */}
              <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 w-full sm:w-auto hide-scrollbar">
                  {STYLES.map((style) => (
                    <button
                      key={style}
                      onClick={() => generateDesign(style)}
                      disabled={isGenerating}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap
                        ${selectedStyle === style 
                          ? 'bg-zinc-900 text-white shadow-md' 
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}
                        ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}
                      `}
                    >
                      {style}
                    </button>
                  ))}
                </div>
                {generatedImage && (
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl text-sm font-medium transition-colors whitespace-nowrap"
                  >
                    <Download size={16} />
                    Download
                  </button>
                )}
              </div>

              {/* Main Visualization */}
              <div className="bg-white rounded-3xl p-2 border border-zinc-200 shadow-sm">
                {isGenerating ? (
                  <div className="w-full aspect-[4/3] max-h-[600px] bg-zinc-100 rounded-2xl flex flex-col items-center justify-center">
                    <Loader2 className="animate-spin text-indigo-600 mb-4" size={48} />
                    <p className="text-lg font-medium text-zinc-700">Reimagining your space...</p>
                    <p className="text-sm text-zinc-500 mt-2">Applying {selectedStyle} style</p>
                  </div>
                ) : generatedImage ? (
                  <CompareSlider 
                    originalImage={originalImage} 
                    generatedImage={generatedImage} 
                  />
                ) : (
                  <div className="w-full aspect-[4/3] max-h-[600px] bg-zinc-100 rounded-2xl flex flex-col items-center justify-center">
                    <ImageIcon className="text-zinc-400 mb-4" size={48} />
                    <p className="text-lg font-medium text-zinc-700">Ready to redesign</p>
                    <p className="text-sm text-zinc-500 mt-2">Select a style above to begin</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Chat Interface */}
            <div className="h-[600px] lg:h-auto lg:sticky lg:top-24">
              <ChatInterface 
                messages={messages} 
                onSendMessage={handleSendMessage} 
                isLoading={isChatLoading} 
              />
            </div>
          </div>
        )}
      </div>

      {/* Pricing Modal */}
      {isPricingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-3xl p-8 max-w-4xl w-full shadow-2xl relative my-8">
            <button 
              onClick={() => setIsPricingModalOpen(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600"
            >
              <X size={20} />
            </button>
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold tracking-tight mb-4">Choose your plan</h2>
              <p className="text-lg text-zinc-500">
                Unlock more pictures and keep redesigning your spaces.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Free Plan */}
              <div className="border border-zinc-200 rounded-2xl p-6 flex flex-col">
                <h3 className="text-xl font-semibold mb-2">Free</h3>
                <div className="mb-4">
                  <span className="text-4xl font-bold">$0</span>
                </div>
                <p className="text-zinc-500 mb-6 flex-1">Perfect to try out the AI design consultant.</p>
                <ul className="space-y-3 mb-8">
                  <li className="flex items-center gap-2 text-sm text-zinc-700">
                    <Check size={16} className="text-indigo-600" /> 10 pictures limit
                  </li>
                  <li className="flex items-center gap-2 text-sm text-zinc-700">
                    <Check size={16} className="text-indigo-600" /> Standard resolution
                  </li>
                </ul>
                <button 
                  disabled
                  className="w-full py-2.5 rounded-xl font-medium bg-zinc-100 text-zinc-500 cursor-not-allowed"
                >
                  Current Plan
                </button>
              </div>

              {/* Pro Plan */}
              <div className="border-2 border-indigo-600 rounded-2xl p-6 flex flex-col relative shadow-lg">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-indigo-600 text-white px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase">
                  Most Popular
                </div>
                <h3 className="text-xl font-semibold mb-2">Pro</h3>
                <div className="mb-4">
                  <span className="text-4xl font-bold">$10</span>
                  <span className="text-zinc-500">/month</span>
                </div>
                <p className="text-zinc-500 mb-6 flex-1">For homeowners looking to redesign multiple rooms.</p>
                <ul className="space-y-3 mb-8">
                  <li className="flex items-center gap-2 text-sm text-zinc-700">
                    <Check size={16} className="text-indigo-600" /> 100 pictures per month
                  </li>
                  <li className="flex items-center gap-2 text-sm text-zinc-700">
                    <Check size={16} className="text-indigo-600" /> High resolution downloads
                  </li>
                  <li className="flex items-center gap-2 text-sm text-zinc-700">
                    <Check size={16} className="text-indigo-600" /> Priority chat support
                  </li>
                </ul>
                <button 
                  onClick={() => alert('Stripe integration required for payments.')}
                  className="w-full py-2.5 rounded-xl font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                >
                  Subscribe to Pro
                </button>
              </div>

              {/* Max Plan */}
              <div className="border border-zinc-200 rounded-2xl p-6 flex flex-col">
                <h3 className="text-xl font-semibold mb-2">Max</h3>
                <div className="mb-4">
                  <span className="text-4xl font-bold">$59</span>
                  <span className="text-zinc-500">/month</span>
                </div>
                <p className="text-zinc-500 mb-6 flex-1">For interior designers and professionals.</p>
                <ul className="space-y-3 mb-8">
                  <li className="flex items-center gap-2 text-sm text-zinc-700">
                    <Check size={16} className="text-indigo-600" /> 10,000 pictures per month
                  </li>
                  <li className="flex items-center gap-2 text-sm text-zinc-700">
                    <Check size={16} className="text-indigo-600" /> Commercial usage rights
                  </li>
                  <li className="flex items-center gap-2 text-sm text-zinc-700">
                    <Check size={16} className="text-indigo-600" /> API access
                  </li>
                </ul>
                <button 
                  onClick={() => alert('Stripe integration required for payments.')}
                  className="w-full py-2.5 rounded-xl font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition-colors"
                >
                  Subscribe to Max
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
