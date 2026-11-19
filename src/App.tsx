import { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { PDFDocument, degrees } from 'pdf-lib';
import { 
  Upload, FileText, Printer, Download, Sun, Moon, 
  RotateCw, CheckCircle, AlertCircle, RefreshCw, Info 
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('wbsedcl_theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<{name: string, size: string, pages?: number} | null>(null);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
      localStorage.setItem('wbsedcl_theme', theme);
    } catch {
      // ignore localstorage errors
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const processFile = async (uploadedFile: File) => {
    setIsProcessing(true);
    setError(null);
    setSuccess(null);
    setPdfUrl(null);

    try {
      if (uploadedFile.size > 20 * 1024 * 1024) {
        throw new Error("File is too large. Maximum size is 20MB.");
      }

      const fileBytes = await uploadedFile.arrayBuffer();
      const newPdfDoc = await PDFDocument.create();
      
      const A4_WIDTH = 595.28;
      const A4_HEIGHT = 841.89;
      const TOP_MARGIN = (5 * 72) / 25.4; // 5mm top margin

      const a4Page = newPdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

      let originalWidth = 0;
      let originalHeight = 0;
      let numPages = 1;

      if (uploadedFile.type === 'application/pdf') {
        const pdfDoc = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
        if (pdfDoc.isEncrypted) {
            throw new Error("Password-protected PDFs are not supported.");
        }
        
        const pages = pdfDoc.getPages();
        if (pages.length === 0) {
            throw new Error("The PDF is empty.");
        }
        numPages = pages.length;
        const firstPage = pages[0];
        const { width, height } = firstPage.getSize();
        originalWidth = width;
        originalHeight = height;

        const [embeddedPage] = await newPdfDoc.embedPdf(pdfDoc, [0]);

        let drawWidth = originalWidth;
        let drawHeight = originalHeight;
        let rotation = 0;

        if (originalWidth > originalHeight) {
            rotation = -90;
            drawWidth = originalHeight;
            drawHeight = originalWidth;
        }

        let scale = 1;
        if (drawWidth > A4_WIDTH || drawHeight > (A4_HEIGHT - TOP_MARGIN)) {
            const scaleX = A4_WIDTH / drawWidth;
            const scaleY = (A4_HEIGHT - TOP_MARGIN) / drawHeight;
            scale = Math.min(scaleX, scaleY);
        }

        const finalWidth = drawWidth * scale;
        const finalHeight = drawHeight * scale;

        const x = (A4_WIDTH - finalWidth) / 2;
        const y = A4_HEIGHT - TOP_MARGIN - finalHeight;

        if (rotation === -90) {
            a4Page.drawPage(embeddedPage, {
                x: x,
                y: y + finalHeight,
                width: originalWidth * scale,
                height: originalHeight * scale,
                rotate: degrees(-90)
            });
        } else {
            a4Page.drawPage(embeddedPage, {
                x,
                y,
                width: originalWidth * scale,
                height: originalHeight * scale,
            });
        }
      } else if (uploadedFile.type.startsWith('image/')) {
        let image;
        if (uploadedFile.type === 'image/jpeg' || uploadedFile.type === 'image/jpg') {
            image = await newPdfDoc.embedJpg(fileBytes);
        } else if (uploadedFile.type === 'image/png') {
            image = await newPdfDoc.embedPng(fileBytes);
        } else {
            throw new Error("Unsupported image format. Please upload PNG or JPG.");
        }

        originalWidth = image.width;
        originalHeight = image.height;

        let drawWidth = originalWidth;
        let drawHeight = originalHeight;
        let rotation = 0;

        if (originalWidth > originalHeight) {
            rotation = -90;
            drawWidth = originalHeight;
            drawHeight = originalWidth;
        }

        let scale = 1;
        if (drawWidth > A4_WIDTH || drawHeight > (A4_HEIGHT - TOP_MARGIN)) {
            const scaleX = A4_WIDTH / drawWidth;
            const scaleY = (A4_HEIGHT - TOP_MARGIN) / drawHeight;
            scale = Math.min(scaleX, scaleY);
        }

        const finalWidth = drawWidth * scale;
        const finalHeight = drawHeight * scale;

        const x = (A4_WIDTH - finalWidth) / 2;
        const y = A4_HEIGHT - TOP_MARGIN - finalHeight;

        if (rotation === -90) {
            a4Page.drawImage(image, {
                x: x,
                y: y + finalHeight,
                width: originalWidth * scale,
                height: originalHeight * scale,
                rotate: degrees(-90)
            });
        } else {
            a4Page.drawImage(image, {
                x,
                y,
                width: originalWidth * scale,
                height: originalHeight * scale,
            });
        }
      } else {
        throw new Error("Unsupported file type. Please upload a PDF, PNG, or JPG.");
      }

      const pdfBytes = await newPdfDoc.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      setPdfUrl(url);
      setFileInfo({
        name: uploadedFile.name,
        size: (uploadedFile.size / 1024 / 1024).toFixed(2) + ' MB',
        pages: numPages
      });
      setSuccess("Document processed and ready for printing.");

    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred while processing the file. Ensure the file is not corrupted.");
    } finally {
      setIsProcessing(false);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      processFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg']
    },
    maxFiles: 1
  });

  const handlePrint = () => {
    if (!pdfUrl) return;
    
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = pdfUrl;
    
    document.body.appendChild(iframe);
    
    iframe.onload = () => {
      setTimeout(() => {
        if (iframe.contentWindow) {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        }
      }, 500);
    };
  };

  const handleReset = () => {
    setPdfUrl(null);
    setError(null);
    setSuccess(null);
    setFileInfo(null);
  };

  return (
    <div className={cn("min-h-screen transition-colors duration-200 font-sans", theme === 'dark' ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900")}>
      <header className={cn("sticky top-0 z-10 border-b px-4 py-3 sm:px-6 lg:px-8 shadow-sm flex items-center justify-between", theme === 'dark' ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200")}>
        <div className="flex items-center space-x-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Printer className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">WBSEDCL DC Auto Print</h1>
            <p className={cn("text-xs", theme === 'dark' ? "text-gray-400" : "text-gray-500")}>Professional Receipt Utility</p>
          </div>
        </div>
        <button
          onClick={toggleTheme}
          className={cn("p-2.5 rounded-full transition-colors flex items-center justify-center", theme === 'dark' ? "bg-gray-700 hover:bg-gray-600 text-yellow-400" : "bg-gray-100 hover:bg-gray-200 text-gray-600")}
          aria-label="Toggle theme"
          title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 space-y-6">
            
            {!pdfUrl && !isProcessing && (
              <div 
                {...getRootProps()} 
                className={cn(
                  "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200 group",
                  isDragActive ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : 
                  theme === 'dark' ? "border-gray-700 hover:border-blue-500 hover:bg-gray-800/80 bg-gray-800/40" : "border-gray-300 hover:border-blue-500 hover:bg-blue-50/50 bg-white"
                )}
              >
                <input {...getInputProps()} />
                <div className={cn("w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform", theme === 'dark' ? "bg-blue-950/60 text-blue-400" : "bg-blue-100 text-blue-600")}>
                  <Upload className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Upload WBSEDCL Receipt</h3>
                <p className={cn("text-sm mb-4 transition-colors", theme === 'dark' ? "text-gray-400" : "text-gray-500")}>
                  Drag & drop your PDF or Image here, or click to browse
                </p>
                <div className="flex flex-wrap justify-center gap-2 text-xs">
                  {['PDF', 'PNG', 'JPG', 'Max 20MB'].map((tag) => (
                    <span 
                      key={tag} 
                      className={cn("px-2.5 py-1 rounded-md font-medium border transition-colors", 
                        theme === 'dark' ? "bg-gray-800 text-gray-400 border-gray-700" : "bg-gray-100 text-gray-600 border-gray-200")}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {isProcessing && (
              <div className={cn("rounded-xl p-10 text-center flex flex-col items-center justify-center border", theme === 'dark' ? "bg-gray-800 border-gray-700" : "bg-white shadow-sm border-gray-200")}>
                <RotateCw className="w-12 h-12 text-blue-500 animate-spin mb-4" />
                <h3 className="text-lg font-medium">Processing Document...</h3>
                <p className={cn("text-sm mt-2 transition-colors", theme === 'dark' ? "text-gray-400" : "text-gray-500")}>
                  Auto-detecting orientation and formatting for A4 Print
                </p>
              </div>
            )}

            {pdfUrl && !isProcessing && (
              <div className={cn("rounded-xl p-6 shadow-sm border space-y-6", theme === 'dark' ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200")}>
                <div className={cn("flex items-start space-x-3", theme === 'dark' ? "text-green-400" : "text-green-600")}>
                  <CheckCircle className="w-6 h-6 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold">Ready for Print</h3>
                    <p className="text-sm opacity-90 mt-1">{success}</p>
                  </div>
                </div>

                {fileInfo && (
                  <div className={cn("p-4 rounded-lg text-sm space-y-2 border", theme === 'dark' ? "bg-gray-900/60 border-gray-700" : "bg-gray-50 border-gray-200")}>
                    <div className="flex justify-between">
                      <span className={theme === 'dark' ? "text-gray-400" : "text-gray-500"}>File Name:</span>
                      <span className="font-medium truncate ml-4" title={fileInfo.name}>{fileInfo.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={theme === 'dark' ? "text-gray-400" : "text-gray-500"}>Size:</span>
                      <span className="font-medium">{fileInfo.size}</span>
                    </div>
                    {fileInfo.pages !== undefined && (
                      <div className="flex justify-between">
                        <span className={theme === 'dark' ? "text-gray-400" : "text-gray-500"}>Pages:</span>
                        <span className="font-medium">{fileInfo.pages}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button 
                    onClick={handlePrint}
                    className="flex items-center justify-center space-x-2 w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm cursor-pointer"
                  >
                    <Printer className="w-5 h-5" />
                    <span>Print Now</span>
                  </button>
                  <a 
                    href={pdfUrl}
                    download={`ReadyForPrint_${fileInfo?.name || 'document.pdf'}`}
                    className={cn("flex items-center justify-center space-x-2 w-full py-3 px-4 rounded-lg font-medium transition-colors border cursor-pointer", 
                      theme === 'dark' ? "border-gray-600 hover:bg-gray-700 text-gray-200" : "border-gray-300 hover:bg-gray-50 text-gray-700")}
                  >
                    <Download className="w-5 h-5" />
                    <span>Download</span>
                  </a>
                </div>
                
                <button 
                  onClick={handleReset}
                  className={cn("flex items-center justify-center space-x-2 w-full py-2 text-sm transition-colors cursor-pointer", theme === 'dark' ? "text-gray-400 hover:text-gray-200" : "text-gray-500 hover:text-gray-700")}
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Upload Another File</span>
                </button>
              </div>
            )}

            {error && (
              <div className={cn("flex items-start space-x-3 p-4 border rounded-xl", theme === 'dark' ? "bg-red-950/30 border-red-800 text-red-300" : "bg-red-50 border-red-200 text-red-600")}>
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div className="text-sm font-medium">{error}</div>
              </div>
            )}

            <div className={cn("p-5 rounded-xl border space-y-4", theme === 'dark' ? "bg-gray-800 border-gray-700" : "bg-white shadow-sm border-gray-200")}>
              <h3 className="font-semibold flex items-center space-x-2">
                <Info className="w-5 h-5 text-blue-500" />
                <span>Features</span>
              </h3>
              <ul className={cn("text-sm space-y-2", theme === 'dark' ? "text-gray-300" : "text-gray-600")}>
                <li className="flex items-start space-x-2">
                  <span className="text-blue-500 mt-1">•</span>
                  <span>Auto-detects Landscape & rotates to Portrait.</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-blue-500 mt-1">•</span>
                  <span>Perfectly centers on A4 with a 5mm top margin.</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-blue-500 mt-1">•</span>
                  <span>Preserves original vector quality, fonts, and barcodes.</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-blue-500 mt-1">•</span>
                  <span>100% private. Files never leave your device.</span>
                </li>
              </ul>
            </div>

          </div>

          <div className="lg:col-span-7">
            <div className={cn("h-[600px] lg:h-[calc(100vh-12rem)] rounded-xl border shadow-sm overflow-hidden flex flex-col", theme === 'dark' ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200")}>
              <div className={cn("py-3 px-4 border-b flex items-center justify-between", theme === 'dark' ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-gray-50")}>
                <h3 className="font-medium flex items-center space-x-2">
                  <FileText className={cn("w-4 h-4", theme === 'dark' ? "text-gray-400" : "text-gray-500")} />
                  <span>Live Preview</span>
                </h3>
                {pdfUrl && <span className={cn("text-xs px-2 py-1 rounded font-medium", theme === 'dark' ? "bg-blue-950 text-blue-300 border border-blue-800" : "bg-blue-100 text-blue-700")}>A4 Portrait</span>}
              </div>
              
              <div className={cn("flex-1 relative transition-colors", theme === 'dark' ? "bg-gray-900" : "bg-gray-200")}>
                {pdfUrl ? (
                  <iframe 
                    src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0`} 
                    className="w-full h-full border-none"
                    title="PDF Preview"
                  />
                ) : (
                  <div className={cn("absolute inset-0 flex flex-col items-center justify-center p-6 text-center transition-colors", theme === 'dark' ? "text-gray-400" : "text-gray-500")}>
                    <FileText className="w-16 h-16 mb-4 opacity-40" />
                    <p className="text-lg font-medium mb-1">No preview available</p>
                    <p className="text-sm">Upload a receipt to see the print-ready preview here</p>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
