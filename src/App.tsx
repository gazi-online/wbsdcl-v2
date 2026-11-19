import { useState, useEffect, useCallback, useRef } from 'react';
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

  const [pdfUrl, setPdfUrl]       = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState<string | null>(null);
  const [fileInfo, setFileInfo]   = useState<{ name: string; size: string; pages?: number } | null>(null);
  const [mounted, setMounted]     = useState(false);

  // ── Splash / hero-to-nav icon states ──────────────────────
  type SplashPhase = 'center' | 'moving' | 'done';
  const [splashPhase, setSplashPhase] = useState<SplashPhase>('center');
  const navIconRef = useRef<HTMLDivElement>(null);
  const [splashStyle, setSplashStyle] = useState<React.CSSProperties>({
    top: '50%', left: '50%',
    transform: 'translate(-50%, -50%) scale(1)',
    opacity: 0,
  });

  useEffect(() => {
    // Step 1 — fade-in icon at center of screen
    const t1 = setTimeout(() => {
      setSplashStyle({
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%) scale(1)',
        opacity: 1,
        transition: 'opacity 0.45s cubic-bezier(0.16, 1, 0.3, 1)',
      });
    }, 80);

    // Step 2 — fly to nav slot
    const t2 = setTimeout(() => {
      setSplashPhase('moving');
      const rect = navIconRef.current?.getBoundingClientRect();
      if (rect) {
        const cx = rect.left + rect.width  / 2;
        const cy = rect.top  + rect.height / 2;
        const scaleTo = rect.width / 40; // splash icon is 40px, match target
        setSplashStyle({
          top:  `${cy}px`,
          left: `${cx}px`,
          transform: `translate(-50%, -50%) scale(${scaleTo})`,
          opacity: 1,
          transition:
            'top 0.65s cubic-bezier(0.4, 0, 0.2, 1),' +
            'left 0.65s cubic-bezier(0.4, 0, 0.2, 1),' +
            'transform 0.65s cubic-bezier(0.4, 0, 0.2, 1)',
        });
      }
    }, 1000);

    // Step 3 — fade out splash icon, reveal real nav icon
    const t3 = setTimeout(() => {
      setSplashStyle(s => ({ ...s, opacity: 0, transition: 'opacity 0.3s ease' }));
    }, 1600);

    // Step 4 — fully done, show rest of UI
    const t4 = setTimeout(() => {
      setSplashPhase('done');
      setMounted(true);
    }, 1950);

    return () => [t1, t2, t3, t4].forEach(clearTimeout);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem('wbsedcl_theme', theme); } catch { /* noop */ }
  }, [theme]);

  // ── Theme ripple ──────────────────────────────────────────
  const [ripple, setRipple]       = useState<{ x: number; y: number; newTheme: 'light' | 'dark' } | null>(null);
  const [iconKey, setIconKey]     = useState(0);   // re-mount icon to retrigger CSS anim
  const [btnBurst, setBtnBurst]   = useState(false);
  const toggleBtnRef              = useRef<HTMLButtonElement>(null);

  const handleToggleTheme = () => {
    if (ripple) return; // block double-tap during animation
    const btn        = toggleBtnRef.current;
    const newTheme   = theme === 'light' ? 'dark' : 'light';

    // Button burst
    setBtnBurst(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setBtnBurst(true)));

    if (!btn) { setTheme(newTheme); return; }

    const rect = btn.getBoundingClientRect();
    setRipple({
      x: Math.round(rect.left + rect.width  / 2),
      y: Math.round(rect.top  + rect.height / 2),
      newTheme,
    });
  };

  const handleRippleEnd = () => {
    if (!ripple) return;
    setTheme(ripple.newTheme);    // apply theme once ripple covers everything
    setIconKey(k => k + 1);       // re-trigger icon entrance animation
    setRipple(null);
  };

  /* ── PDF / image processing ──────────────────────────── */
  const processFile = async (uploadedFile: File) => {
    setIsProcessing(true);
    setError(null);
    setSuccess(null);
    setPdfUrl(null);

    try {
      if (uploadedFile.size > 20 * 1024 * 1024)
        throw new Error('File is too large. Maximum size is 20MB.');

      const fileBytes  = await uploadedFile.arrayBuffer();
      const newPdfDoc  = await PDFDocument.create();
      const A4_WIDTH   = 595.28;
      const A4_HEIGHT  = 841.89;
      const TOP_MARGIN = (5 * 72) / 25.4;
      const a4Page     = newPdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
      let originalWidth = 0, originalHeight = 0, numPages = 1;

      if (uploadedFile.type === 'application/pdf') {
        const pdfDoc = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
        if (pdfDoc.isEncrypted) throw new Error('Password-protected PDFs are not supported.');
        const pages = pdfDoc.getPages();
        if (!pages.length) throw new Error('The PDF is empty.');
        numPages = pages.length;
        ({ width: originalWidth, height: originalHeight } = pages[0].getSize());
        const [embeddedPage] = await newPdfDoc.embedPdf(pdfDoc, [0]);

        let drawW = originalWidth, drawH = originalHeight, rot = 0;
        if (originalWidth > originalHeight) { rot = -90; drawW = originalHeight; drawH = originalWidth; }
        let scale = 1;
        if (drawW > A4_WIDTH || drawH > A4_HEIGHT - TOP_MARGIN)
          scale = Math.min(A4_WIDTH / drawW, (A4_HEIGHT - TOP_MARGIN) / drawH);
        const finalW = drawW * scale, finalH = drawH * scale;
        const x = (A4_WIDTH - finalW) / 2, y = A4_HEIGHT - TOP_MARGIN - finalH;
        if (rot === -90)
          a4Page.drawPage(embeddedPage, { x, y: y + finalH, width: originalWidth * scale, height: originalHeight * scale, rotate: degrees(-90) });
        else
          a4Page.drawPage(embeddedPage, { x, y, width: originalWidth * scale, height: originalHeight * scale });

      } else if (uploadedFile.type.startsWith('image/')) {
        let image;
        if (uploadedFile.type === 'image/jpeg' || uploadedFile.type === 'image/jpg')
          image = await newPdfDoc.embedJpg(fileBytes);
        else if (uploadedFile.type === 'image/png')
          image = await newPdfDoc.embedPng(fileBytes);
        else throw new Error('Unsupported image format. Please upload PNG or JPG.');

        originalWidth = image.width; originalHeight = image.height;
        let drawW = originalWidth, drawH = originalHeight, rot = 0;
        if (originalWidth > originalHeight) { rot = -90; drawW = originalHeight; drawH = originalWidth; }
        let scale = 1;
        if (drawW > A4_WIDTH || drawH > A4_HEIGHT - TOP_MARGIN)
          scale = Math.min(A4_WIDTH / drawW, (A4_HEIGHT - TOP_MARGIN) / drawH);
        const finalW = drawW * scale, finalH = drawH * scale;
        const x = (A4_WIDTH - finalW) / 2, y = A4_HEIGHT - TOP_MARGIN - finalH;
        if (rot === -90)
          a4Page.drawImage(image, { x, y: y + finalH, width: originalWidth * scale, height: originalHeight * scale, rotate: degrees(-90) });
        else
          a4Page.drawImage(image, { x, y, width: originalWidth * scale, height: originalHeight * scale });
      } else {
        throw new Error('Unsupported file type. Please upload a PDF, PNG, or JPG.');
      }

      const pdfBytes = await newPdfDoc.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      setPdfUrl(URL.createObjectURL(blob));
      setFileInfo({ name: uploadedFile.name, size: (uploadedFile.size / 1024 / 1024).toFixed(2) + ' MB', pages: numPages });
      setSuccess('Document processed and ready for printing.');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while processing the file.');
    } finally {
      setIsProcessing(false);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) processFile(acceptedFiles[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'] },
    maxFiles: 1,
  });

  const handlePrint = () => {
    if (!pdfUrl) return;
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = pdfUrl;
    document.body.appendChild(iframe);
    iframe.onload = () => setTimeout(() => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }, 500);
  };

  const handleReset = () => { setPdfUrl(null); setError(null); setSuccess(null); setFileInfo(null); };

  /* ── helpers ─────────────────────────────────────────── */
  const dark = theme === 'dark';

  return (
    <div className={cn(
      'min-h-screen font-sans transition-colors duration-300',
      dark ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900',
    )}>

      {/* ── Splash: flying printer icon overlay ── */}
      {splashPhase !== 'done' && (
        <>
          {/* Full-screen backdrop — only during 'center' phase */}
          <div
            className={cn(
              'fixed inset-0 z-[9998] transition-opacity duration-500 pointer-events-none',
              dark ? 'bg-gray-900' : 'bg-gray-50',
              splashPhase === 'moving' ? 'opacity-0' : 'opacity-100',
            )}
          />

          {/* Flying icon — fixed, positioned via inline style */}
          <div
            style={splashStyle}
            className="fixed z-[9999] pointer-events-none"
          >
            {/* Big centered version (40px box, scale handled by splashStyle) */}
            <div className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center',
              'bg-blue-600 shadow-2xl',
              splashPhase === 'center' && 'icon-appear shadow-blue-500/40',
            )}>
              <Printer className="w-6 h-6 text-white" />
            </div>
          </div>
        </>
      )}

      {/* ── Theme ripple overlay ── */}
      {ripple && (
        <div
          style={{
            '--rx': `${ripple.x}px`,
            '--ry': `${ripple.y}px`,
            backgroundColor: ripple.newTheme === 'dark' ? '#111827' : '#f9fafb',
          } as React.CSSProperties}
          className="fixed inset-0 z-[9996] pointer-events-none theme-ripple"
          onAnimationEnd={handleRippleEnd}
        />
      )}

      {/* ── Header ── */}
      <header className={cn(
        'sticky top-0 z-10 border-b px-4 py-3 sm:px-6 lg:px-8 shadow-sm flex items-center justify-between',
        'transition-colors duration-300',
        dark ? 'bg-gray-800/90 backdrop-blur border-gray-700' : 'bg-white/90 backdrop-blur border-gray-200',
        mounted ? 'animate-fade-in-down' : 'opacity-0',
      )}>
        <div className="flex items-center space-x-3">
          {/* Real nav icon slot — invisible while splash plays, then fades in */}
          <div
            ref={navIconRef}
            className={cn(
              'bg-blue-600 p-2 rounded-lg shadow-lg transition-all duration-200 hover:scale-110',
              splashPhase === 'done' ? 'opacity-100 animate-bounce-in' : 'opacity-0',
            )}
          >
            <Printer className="w-6 h-6 text-white" />
          </div>
          <div className={mounted ? 'animate-fade-in-up delay-100' : 'opacity-0'}>
            <h1 className="text-xl font-bold tracking-tight">WBSEDCL DC Auto Print</h1>
            <p className={cn('text-xs', dark ? 'text-gray-400' : 'text-gray-500')}>Professional Receipt Utility</p>
          </div>
        </div>

        {/* Theme toggle button */}
        <button
          ref={toggleBtnRef}
          onClick={handleToggleTheme}
          className={cn(
            'relative p-2.5 rounded-full flex items-center justify-center overflow-hidden',
            'transition-colors duration-300',
            dark
              ? 'bg-gray-700 hover:bg-gray-600 text-yellow-400'
              : 'bg-gray-100 hover:bg-gray-200 text-indigo-500',
            mounted && 'animate-fade-in delay-200',
            btnBurst && 'toggle-burst',
          )}
          aria-label="Toggle theme"
          title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {/* Icon — keyed so it re-mounts & replays animation on each toggle */}
          <span key={iconKey} className={dark ? 'icon-sun-enter' : 'icon-moon-enter'}>
            {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </span>
        </button>
      </header>

      {/* ── Main ── */}
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* ── Left column ── */}
          <div className="lg:col-span-5 space-y-6">

            {/* Upload zone */}
            {!pdfUrl && !isProcessing && (
              <div
                {...getRootProps()}
                className={cn(
                  'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer',
                  'transition-all duration-300 group',
                  isDragActive
                    ? 'border-blue-500 scale-[1.02] shadow-lg ' + (dark ? 'bg-blue-900/20' : 'bg-blue-50')
                    : dark
                      ? 'border-gray-700 hover:border-blue-500 hover:bg-gray-800/80 hover:shadow-lg hover:scale-[1.01] bg-gray-800/40'
                      : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50/50 hover:shadow-md hover:scale-[1.01] bg-white',
                  mounted ? 'animate-slide-in-left' : 'opacity-0',
                )}
              >
                <input {...getInputProps()} />

                {/* Floating upload icon */}
                <div className={cn(
                  'relative w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4',
                  'transition-transform duration-300 group-hover:scale-110',
                  'animate-float',
                  dark ? 'bg-blue-950/60 text-blue-400' : 'bg-blue-100 text-blue-600',
                )}>
                  <Upload className="w-8 h-8" />
                  {isDragActive && (
                    <span className={cn(
                      'absolute inset-0 rounded-full border-2',
                      dark ? 'border-blue-400' : 'border-blue-500',
                      'pulse-ring',
                    )} />
                  )}
                </div>

                <h3 className="text-lg font-semibold mb-2 transition-colors duration-200">Upload WBSEDCL Receipt</h3>
                <p className={cn('text-sm mb-4 transition-colors duration-200', dark ? 'text-gray-400' : 'text-gray-500')}>
                  {isDragActive ? '🎯 Drop it right here!' : 'Drag & drop your PDF or Image here, or click to browse'}
                </p>

                <div className="flex flex-wrap justify-center gap-2 text-xs">
                  {['PDF', 'PNG', 'JPG', 'Max 20MB'].map((tag, i) => (
                    <span
                      key={tag}
                      className={cn(
                        'px-2.5 py-1 rounded-md font-medium border transition-all duration-200',
                        'hover:scale-105',
                        dark ? 'bg-gray-800 text-gray-400 border-gray-700' : 'bg-gray-100 text-gray-600 border-gray-200',
                        mounted && `animate-fade-in delay-${(i + 2) * 100}`,
                      )}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Processing state */}
            {isProcessing && (
              <div className={cn(
                'rounded-xl p-10 text-center flex flex-col items-center justify-center border',
                'animate-scale-in',
                dark ? 'bg-gray-800 border-gray-700' : 'bg-white shadow-sm border-gray-200',
              )}>
                {/* Spinning rings */}
                <div className="relative w-16 h-16 mb-5">
                  <div className="absolute inset-0 rounded-full border-4 border-blue-200 dark:border-blue-900" />
                  <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500 animate-spin" />
                  <div className="absolute inset-2 rounded-full border-4 border-transparent border-t-blue-400 animate-spin animate-spin-slow" style={{ animationDirection: 'reverse' }} />
                  <div className="absolute inset-4 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <RotateCw className="w-4 h-4 text-blue-500 animate-spin" />
                  </div>
                </div>

                <h3 className="text-lg font-medium animate-fade-in">Processing Document...</h3>
                <p className={cn('text-sm mt-2 animate-fade-in delay-100', dark ? 'text-gray-400' : 'text-gray-500')}>
                  Auto-detecting orientation and formatting for A4 Print
                </p>

                {/* Animated progress bar */}
                <div className={cn('w-full mt-5 h-1.5 rounded-full overflow-hidden', dark ? 'bg-gray-700' : 'bg-gray-200')}>
                  <div className={cn('h-full bg-blue-500 rounded-full progress-bar-animated', dark && 'shimmer')} />
                </div>
              </div>
            )}

            {/* Success / result card */}
            {pdfUrl && !isProcessing && (
              <div className={cn(
                'rounded-xl p-6 shadow-sm border space-y-6',
                'animate-scale-in',
                dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200',
              )}>
                {/* Check mark */}
                <div className={cn('flex items-start space-x-3', dark ? 'text-green-400' : 'text-green-600')}>
                  <CheckCircle className="w-6 h-6 flex-shrink-0 animate-bounce-in" />
                  <div className="animate-fade-in-up delay-100">
                    <h3 className="font-semibold">Ready for Print</h3>
                    <p className="text-sm opacity-90 mt-1">{success}</p>
                  </div>
                </div>

                {/* File info */}
                {fileInfo && (
                  <div className={cn(
                    'p-4 rounded-lg text-sm space-y-2 border animate-fade-in-up delay-200',
                    dark ? 'bg-gray-900/60 border-gray-700' : 'bg-gray-50 border-gray-200',
                  )}>
                    {[
                      { label: 'File Name', value: fileInfo.name, title: fileInfo.name, truncate: true },
                      { label: 'Size', value: fileInfo.size },
                      ...(fileInfo.pages !== undefined ? [{ label: 'Pages', value: String(fileInfo.pages) }] : []),
                    ].map(({ label, value, title, truncate }) => (
                      <div key={label} className="flex justify-between">
                        <span className={dark ? 'text-gray-400' : 'text-gray-500'}>{label}:</span>
                        <span className={cn('font-medium ml-4', truncate && 'truncate')} title={title}>{value}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Action buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in-up delay-300">
                  <button
                    onClick={handlePrint}
                    className={cn(
                      'flex items-center justify-center space-x-2 w-full py-3 px-4',
                      'bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium',
                      'transition-all duration-200 shadow-sm cursor-pointer',
                      'hover:shadow-blue-500/30 hover:shadow-lg hover:-translate-y-0.5',
                      'active:translate-y-0 active:shadow-sm btn-press glow-blue',
                    )}
                  >
                    <Printer className="w-5 h-5" />
                    <span>Print Now</span>
                  </button>
                  <a
                    href={pdfUrl}
                    download={`ReadyForPrint_${fileInfo?.name || 'document.pdf'}`}
                    className={cn(
                      'flex items-center justify-center space-x-2 w-full py-3 px-4 rounded-lg font-medium',
                      'transition-all duration-200 border cursor-pointer',
                      'hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 btn-press',
                      dark
                        ? 'border-gray-600 hover:bg-gray-700 text-gray-200'
                        : 'border-gray-300 hover:bg-gray-50 text-gray-700',
                    )}
                  >
                    <Download className="w-5 h-5" />
                    <span>Download</span>
                  </a>
                </div>

                <button
                  onClick={handleReset}
                  className={cn(
                    'flex items-center justify-center space-x-2 w-full py-2 text-sm',
                    'transition-all duration-200 cursor-pointer rounded-lg',
                    'hover:scale-105 active:scale-100',
                    dark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700',
                    'animate-fade-in delay-400',
                  )}
                >
                  <RefreshCw className="w-4 h-4 transition-transform duration-500 hover:rotate-180" />
                  <span>Upload Another File</span>
                </button>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className={cn(
                'flex items-start space-x-3 p-4 border rounded-xl',
                'animate-scale-in',
                dark ? 'bg-red-950/30 border-red-800 text-red-300' : 'bg-red-50 border-red-200 text-red-600',
              )}>
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 animate-bounce-in" />
                <div className="text-sm font-medium animate-fade-in delay-100">{error}</div>
              </div>
            )}

            {/* Features card */}
            <div className={cn(
              'p-5 rounded-xl border space-y-4',
              'transition-all duration-300',
              dark ? 'bg-gray-800 border-gray-700' : 'bg-white shadow-sm border-gray-200',
              mounted ? 'animate-slide-in-left delay-300' : 'opacity-0',
            )}>
              <h3 className="font-semibold flex items-center space-x-2">
                <Info className="w-5 h-5 text-blue-500" />
                <span>Features</span>
              </h3>
              <ul className={cn('text-sm space-y-2', dark ? 'text-gray-300' : 'text-gray-600')}>
                {[
                  'Auto-detects Landscape & rotates to Portrait.',
                  'Perfectly centers on A4 with a 5mm top margin.',
                  'Preserves original vector quality, fonts, and barcodes.',
                  '100% private. Files never leave your device.',
                ].map((text, i) => (
                  <li
                    key={i}
                    className={cn(
                      'flex items-start space-x-2 transition-all duration-200',
                      'hover:translate-x-1',
                      mounted && `animate-fade-in-up delay-${(i + 4) * 100}`,
                    )}
                  >
                    <span className="text-blue-500 mt-1 flex-shrink-0">•</span>
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ── Right column — Live Preview ── */}
          <div className={cn('lg:col-span-7', mounted ? 'animate-slide-in-right delay-200' : 'opacity-0')}>
            <div className={cn(
              'h-[600px] lg:h-[calc(100vh-12rem)] rounded-xl border shadow-sm overflow-hidden flex flex-col',
              'transition-all duration-300',
              dark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200',
            )}>
              {/* Preview header */}
              <div className={cn(
                'py-3 px-4 border-b flex items-center justify-between',
                'transition-colors duration-300',
                dark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50',
              )}>
                <h3 className="font-medium flex items-center space-x-2">
                  <FileText className={cn('w-4 h-4', dark ? 'text-gray-400' : 'text-gray-500')} />
                  <span>Live Preview</span>
                </h3>
                {pdfUrl && (
                  <span className={cn(
                    'text-xs px-2 py-1 rounded font-medium animate-bounce-in',
                    dark ? 'bg-blue-950 text-blue-300 border border-blue-800' : 'bg-blue-100 text-blue-700',
                  )}>
                    A4 Portrait
                  </span>
                )}
              </div>

              {/* Preview body */}
              <div className={cn(
                'flex-1 relative transition-colors duration-300',
                dark ? 'bg-gray-900' : 'bg-gray-200',
              )}>
                {pdfUrl ? (
                  <iframe
                    key={pdfUrl}
                    src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                    className="w-full h-full border-none animate-fade-in"
                    title="PDF Preview"
                  />
                ) : (
                  <div className={cn(
                    'absolute inset-0 flex flex-col items-center justify-center p-6 text-center',
                    'transition-colors duration-300',
                    dark ? 'text-gray-500' : 'text-gray-400',
                  )}>
                    <FileText className="w-16 h-16 mb-4 opacity-30 animate-float" />
                    <p className="text-lg font-medium mb-1 animate-fade-in-up">{isProcessing ? 'Processing…' : 'No preview available'}</p>
                    <p className="text-sm animate-fade-in-up delay-100">Upload a receipt to see the print-ready preview here</p>
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
