import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  Barcode,
  Camera,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  VideoOff,
  Upload,
  RefreshCw,
  ScanLine,
  HelpCircle,
  UserPlus,
  Loader2
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { FormField } from '../../components/ui/FormField';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { validateQrPayload, startCollegeIdVerification } from '../../services/verification';

type ScanMode = 'CAMERA' | 'FILE' | 'MANUAL';

export const QrScannerPageInner: React.FC = () => {
  const navigate = useNavigate();

  const [scanMode, setScanMode] = useState<ScanMode>('CAMERA');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [detectedValue, setDetectedValue] = useState<string | null>(null);
  const [manualPayload, setManualPayload] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isUnregisteredError, setIsUnregisteredError] = useState<boolean>(false);
  const [isCameraStarting, setIsCameraStarting] = useState<boolean>(false);

  // References to active scanner instance and mounting state
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isProcessingRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const containerId = 'campusvote-universal-scanner-viewport';

  // Configured supported barcode and QR formats
  const supportedFormats = [
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.ITF,
  ];

  // Stop camera stream tracks and clear scanning loops
  const stopCamera = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (err) {
        console.warn('Notice while stopping media scanner:', err);
      }
      scannerRef.current = null;
    }

    if (isMountedRef.current) {
      setIsScanning(false);
      setIsCameraStarting(false);
    }
  }, []);

  // Teardown camera on unmount or tab switch
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopCamera();
    };
  }, [stopCamera]);

  const processDecodedContent = async (rawContent: string) => {
    const cleaned = rawContent.trim();
    if (!cleaned) {
      isProcessingRef.current = false;
      return;
    }

    setIsProcessing(true);
    setScannerError(null);
    setIsUnregisteredError(false);
    setDetectedValue(cleaned);
    setStatusMessage(
      `Detected code: "${cleaned.length > 32 ? cleaned.substring(0, 32) + '...' : cleaned}". Validating with server...`
    );

    try {
      let targetCollegeId = cleaned;

      // 1. Server-side validation of QR / barcode payload
      try {
        const qrResult = await validateQrPayload({ qr_payload: cleaned });
        targetCollegeId = qrResult.college_id;
        setStatusMessage(`Validated identity: ${qrResult.student_name} (${targetCollegeId}). Requesting verification code...`);
      } catch (validationErr: any) {
        const errMsg = validationErr?.details?.error || validationErr?.message || '';
        if (errMsg.toLowerCase().includes('not found') || errMsg.toLowerCase().includes('registry')) {
          setScannerError(errMsg);
          setIsUnregisteredError(true);
          setStatusMessage(null);
          setIsProcessing(false);
          isProcessingRef.current = false;
          return;
        }
        // Fallback: pass cleaned directly to startCollegeIdVerification
        targetCollegeId = cleaned;
      }

      // 2. Initiate OTP verification challenge
      const otpSession = await startCollegeIdVerification({
        college_id: targetCollegeId,
        channel: 'EMAIL',
      });

      setStatusMessage('Verification challenge sent. Directing to challenge screen...');

      setTimeout(() => {
        if (isMountedRef.current) {
          navigate('/login/verify', {
            state: otpSession,
            replace: true,
          });
        }
      }, 600);
    } catch (err: any) {
      const errorMsg =
        err?.details?.error ||
        err?.message ||
        'Card verification failed. Please ensure the code is clear and registered.';
      setScannerError(errorMsg);
      setStatusMessage(null);

      if (
        errorMsg.toLowerCase().includes('not found') ||
        errorMsg.toLowerCase().includes('register') ||
        err?.details?.code === 'STUDENT_NOT_FOUND'
      ) {
        setIsUnregisteredError(true);
      }
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  };

  const startCamera = async () => {
    setScannerError(null);
    setStatusMessage(null);
    setDetectedValue(null);
    setIsUnregisteredError(false);
    setIsCameraStarting(true);

    // Verify browser support for mediaDevices
    if (typeof navigator === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
      setIsCameraStarting(false);
      setIsScanning(false);
      setScannerError(
        'Camera access is not supported by your browser in this context. Please use photo upload or manual entry below.'
      );
      return;
    }

    try {
      // 1. Ensure any previous scanner is cleanly stopped
      await stopCamera();

      // 2. Instantiate Html5Qrcode with all supported formats
      const scanner = new Html5Qrcode(containerId, {
        formatsToSupport: supportedFormats,
        verbose: false,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true,
        },
      });
      scannerRef.current = scanner;

      // Wide scanning bounding box that captures 1D barcodes and 2D QR codes
      const qrBoxFunction = (viewfinderWidth: number, viewfinderHeight: number) => {
        const w = Math.floor(viewfinderWidth * 0.88);
        const h = Math.floor(Math.min(viewfinderHeight * 0.82, w * 0.82));
        return { width: Math.max(w, 240), height: Math.max(h, 180) };
      };

      const scanConfig = {
        fps: 20,
        qrbox: qrBoxFunction,
        aspectRatio: 1.333333,
      };

      const onScanSuccess = async (decodedText: string) => {
        if (isProcessingRef.current) return;
        isProcessingRef.current = true;

        await stopCamera();
        await processDecodedContent(decodedText);
      };

      const onScanFailure = () => {
        // Frame skipped without code - expected during normal continuous camera capture
      };

      try {
        // Prefer rear camera on mobile devices
        await scanner.start(
          { facingMode: 'environment' },
          scanConfig,
          onScanSuccess,
          onScanFailure
        );
      } catch (rearErr: any) {
        console.info('Rear camera unavailable or rejected, attempting default/webcam device:', rearErr);
        // Fallback to user-facing / default webcam
        await scanner.start(
          { facingMode: 'user' },
          scanConfig,
          onScanSuccess,
          onScanFailure
        );
      }

      if (isMountedRef.current) {
        setIsScanning(true);
        setIsCameraStarting(false);
      }
    } catch (err: any) {
      console.error('Camera startup failure:', err);
      if (isMountedRef.current) {
        await stopCamera();

        const errorStr = (err?.name || err?.message || err?.toString() || '').toLowerCase();
        if (errorStr.includes('notallowed') || errorStr.includes('permission')) {
          setScannerError(
            'Camera permission was denied. Please allow camera access in your browser address bar and click Retry.'
          );
        } else if (
          errorStr.includes('notfound') ||
          errorStr.includes('devicesnotfound') ||
          errorStr.includes('requested device not found')
        ) {
          setScannerError(
            'No camera found on this device. Please upload an ID card photo or use manual entry below.'
          );
        } else if (errorStr.includes('notreadable') || errorStr.includes('trackstart')) {
          setScannerError(
            'Camera is in use by another application or tab. Please close other camera apps and click Retry.'
          );
        } else {
          setScannerError(
            'Unable to start video scanner. Please check camera permissions or use photo upload / manual entry.'
          );
        }
      }
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    await stopCamera();
    setScannerError(null);
    setStatusMessage('Analyzing ID card image locally in browser...');
    setIsProcessing(true);

    try {
      const fileScanner = new Html5Qrcode('campusvote-file-scanner-temp', {
        formatsToSupport: supportedFormats,
        verbose: false,
      });

      const decodedText = await fileScanner.scanFile(file, false);
      fileScanner.clear();
      await processDecodedContent(decodedText);
    } catch (err: any) {
      console.warn('Image barcode scan error:', err);
      setScannerError(
        'No supported QR code or barcode detected in this image. Please ensure good lighting and clear focus, or use manual entry below.'
      );
      setStatusMessage(null);
    } finally {
      setIsProcessing(false);
      event.target.value = '';
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-surface-canvas">
      <div className="sm:mx-auto sm:w-full sm:max-w-lg px-4">
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-navy-950 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Login
        </Link>

        <Card className="shadow-elevated">
          <CardHeader className="text-center pb-3">
            <div className="w-12 h-12 rounded-2xl bg-navy-900 text-white flex items-center justify-center mx-auto mb-3 shadow-sm">
              <ScanLine className="w-6 h-6 text-brand-cyan" />
            </div>
            <CardTitle className="text-xl">Student ID QR Scanner</CardTitle>
            <CardDescription className="text-xs">
              Universal decoder for college identity cards, 1D barcodes, and QR credentials.
            </CardDescription>

            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl mt-4 border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setScanMode('CAMERA');
                  setScannerError(null);
                }}
                className={`py-2 px-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  scanMode === 'CAMERA'
                    ? 'bg-white text-navy-950 shadow-xs'
                    : 'text-slate-600 hover:text-navy-950'
                }`}
              >
                <Camera className="w-3.5 h-3.5 text-brand-primary" />
                <span>Live Camera</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setScanMode('FILE');
                  setScannerError(null);
                }}
                className={`py-2 px-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  scanMode === 'FILE'
                    ? 'bg-white text-navy-950 shadow-xs'
                    : 'text-slate-600 hover:text-navy-950'
                }`}
              >
                <Upload className="w-3.5 h-3.5 text-brand-primary" />
                <span>Upload Photo</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setScanMode('MANUAL');
                  setScannerError(null);
                }}
                className={`py-2 px-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  scanMode === 'MANUAL'
                    ? 'bg-white text-navy-950 shadow-xs'
                    : 'text-slate-600 hover:text-navy-950'
                }`}
              >
                <Barcode className="w-3.5 h-3.5 text-brand-primary" />
                <span>Manual Entry</span>
              </button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 pt-2">
            {/* Supported Format Tags */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 py-1 px-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-500">
              <span className="font-semibold text-slate-700 mr-1">Supported:</span>
              <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono">QR</span>
              <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono">Code 128</span>
              <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono">Code 39</span>
              <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono">EAN-13/8</span>
              <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono">UPC-A/E</span>
              <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono">ITF</span>
            </div>

            {/* Error Banner */}
            {scannerError && (
              <div
                className="p-3.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs flex flex-col gap-2.5"
                role="alert"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="leading-relaxed font-medium">{scannerError}</span>
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-red-200/60">
                  {scanMode === 'CAMERA' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={startCamera}
                      isLoading={isCameraStarting}
                      leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                    >
                      Retry Camera
                    </Button>
                  )}
                  {isUnregisteredError && (
                    <Link
                      to="/register"
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-red-600 text-white font-semibold text-xs hover:bg-red-700 transition-colors shadow-xs ml-auto"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Register Student ID
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Status Feedback */}
            {statusMessage && (
              <div
                className="p-3.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs flex items-start gap-2.5"
                role="status"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 animate-pulse" />
                <span className="leading-relaxed font-medium">{statusMessage}</span>
              </div>
            )}

            {/* Detection Indicator */}
            {detectedValue && (
              <div className="p-2.5 rounded-lg border border-blue-200 bg-blue-50/70 text-navy-950 text-xs flex items-center justify-between">
                <span className="text-slate-600 font-medium">Scanned Code:</span>
                <span className="font-mono font-bold text-brand-primary">{detectedValue}</span>
              </div>
            )}

            {/* Camera Viewport Area */}
            {scanMode === 'CAMERA' && (
              <div className="rounded-xl overflow-hidden border border-slate-300 bg-slate-950 relative min-h-[300px] flex flex-col items-center justify-center">
                {/* Real Live HTML5 Video Container managed directly by Html5Qrcode engine */}
                <div id={containerId} className="w-full h-full min-h-[300px]" />

                {/* CSS to ensure injected video element fills viewport smoothly */}
                <style>{`
                  #${containerId} video {
                    width: 100% !important;
                    height: 100% !important;
                    min-height: 300px !important;
                    object-fit: cover !important;
                    border-radius: 0.75rem;
                  }
                  #${containerId} #qr-shaded-region {
                    border-radius: 0.75rem;
                  }
                `}</style>

                {/* Visible Loading State while acquiring camera */}
                {isCameraStarting && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 text-white z-10 p-6 space-y-3">
                    <Loader2 className="w-8 h-8 text-brand-cyan animate-spin" />
                    <p className="text-xs font-semibold text-slate-200">
                      Requesting camera access &amp; initializing video feed...
                    </p>
                  </div>
                )}

                {/* Camera Offline Placeholder */}
                {!isScanning && !isCameraStarting && (
                  <div className="absolute inset-0 p-8 flex flex-col items-center justify-center bg-slate-900 text-center space-y-3 w-full z-10">
                    <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 shadow-inner">
                      <Camera className="w-7 h-7 text-brand-cyan" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Camera Offline</h4>
                      <p className="text-xs text-slate-400 max-w-xs mt-1">
                        Camera permission is requested only after you start scanning. Center the barcode or QR code in good lighting.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="primary"
                      size="md"
                      onClick={startCamera}
                      isLoading={isCameraStarting}
                      disabled={isProcessing}
                      leftIcon={<Camera className="w-4 h-4" />}
                    >
                      Activate Camera Scanner
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Hidden container for file scanning helper */}
            <div id="campusvote-file-scanner-temp" className="hidden" />

            {/* Active Camera Controls */}
            {scanMode === 'CAMERA' && isScanning && (
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                  Scanner Active (QR &amp; Barcode)
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await stopCamera();
                      await startCamera();
                    }}
                    leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                  >
                    Restart
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={stopCamera}
                    leftIcon={<VideoOff className="w-3.5 h-3.5" />}
                  >
                    Stop
                  </Button>
                </div>
              </div>
            )}

            {/* TAB 2: Photo Upload Mode */}
            {scanMode === 'FILE' && (
              <div className="p-6 border-2 border-dashed border-slate-300 rounded-xl text-center space-y-3 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                <div className="w-12 h-12 rounded-full bg-blue-50 text-brand-primary flex items-center justify-center mx-auto">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-navy-950">Upload ID Card Image</h4>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">
                    Select a photo of your college ID card containing a barcode or QR code. Processing occurs entirely in your browser.
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="id-card-file"
                    className="cursor-pointer inline-flex items-center justify-center px-4 py-2 text-xs font-semibold rounded-lg bg-navy-900 text-white hover:bg-navy-800 transition-colors shadow-sm"
                  >
                    Choose Photo File
                  </label>
                  <input
                    id="id-card-file"
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    disabled={isProcessing}
                    className="hidden"
                  />
                </div>
                <p className="text-[11px] text-slate-400">Supported: JPG, PNG, WebP</p>
              </div>
            )}

            {/* Manual Fallback Entry Form */}
            {(scanMode === 'MANUAL' || scanMode === 'CAMERA') && (
              <div className="space-y-3 p-4 rounded-xl border border-slate-200 bg-white shadow-subtle mt-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>Manual ID &amp; Barcode Entry</span>
                  <span className="text-[11px] font-normal text-slate-400">Fallback Option</span>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    processDecodedContent(manualPayload);
                  }}
                  className="space-y-3"
                >
                  <FormField label="College ID or QR String" htmlFor="manual-qr">
                    <Input
                      id="manual-qr"
                      placeholder="e.g. CS2026001, STU-2026-001, 23341A4234, or barcode string"
                      value={manualPayload}
                      onChange={(e) => setManualPayload(e.target.value)}
                      disabled={isProcessing}
                    />
                  </FormField>
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      className="flex-1"
                      isLoading={isProcessing}
                      disabled={!manualPayload.trim()}
                    >
                      Validate &amp; Request OTP
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setManualPayload('CS2026001');
                        processDecodedContent('CS2026001');
                      }}
                    >
                      Demo ID
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </CardContent>

          <CardFooter className="justify-between text-[11px] text-slate-500 border-t border-surface-border">
            <span className="flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
              Local Client-Side Decoding
            </span>
            <span className="text-navy-950 font-medium">OTP Verification Required</span>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export const QrScannerPage: React.FC = () => {
  return (
    <ErrorBoundary
      fallbackTitle="Scanner Initialisation Notice"
      fallbackMessage="The barcode scanner could not be loaded in this browser window. Please use manual ID entry or return to login."
    >
      <QrScannerPageInner />
    </ErrorBoundary>
  );
};
