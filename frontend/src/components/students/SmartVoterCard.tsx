import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  ShieldCheck,
  Download,
  Printer,
  Copy,
  Check,
  QrCode as QrIcon,
  Vote,
  Building2,
  Clock
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { VoterIdCardData } from '../../services/students';

interface SmartVoterCardProps {
  cardData: VoterIdCardData;
}

// Canvas text wrapping utility for multi-line institutional names and departments
function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): number {
  const words = text.split(' ');
  let line = '';
  let currentY = y;
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line.trim(), x, currentY);
      line = words[n] + ' ';
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), x, currentY);
  return currentY;
}

export const SmartVoterCard: React.FC<SmartVoterCardProps> = ({ cardData }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const cardContainerRef = useRef<HTMLDivElement>(null);

  const isPendingVerification = cardData.enrollment_status === 'PENDING';
  const effectiveCollegeName = cardData.college_name || 'CampusVote Collegiate Institute';

  // Generate QR code data URL from signed opaque payload
  useEffect(() => {
    let isMounted = true;
    if (cardData.qr_payload) {
      QRCode.toDataURL(cardData.qr_payload, {
        width: 180,
        margin: 1,
        color: {
          dark: '#0b192c',
          light: '#ffffff',
        },
      })
        .then((url) => {
          if (isMounted) setQrDataUrl(url);
        })
        .catch((err) => {
          console.error('Error rendering QR code data URL:', err);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [cardData.qr_payload]);

  const handleCopyVoterId = () => {
    navigator.clipboard.writeText(cardData.voter_id_number);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  // High-resolution Canvas rendering for PNG download
  const handleDownloadPng = async () => {
    setIsDownloading(true);
    try {
      const canvas = document.createElement('canvas');
      // 2x Retina resolution for ultra-sharp card export (width: 800px, height: 500px)
      const scale = 2;
      const width = 800;
      const height = 500;
      canvas.width = width * scale;
      canvas.height = height * scale;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(scale, scale);

      // Card Background with smooth rounded corners
      ctx.fillStyle = '#0f172a'; // Deep navy slate
      ctx.beginPath();
      ctx.roundRect(0, 0, width, height, 20);
      ctx.fill();

      // Header Banner Gradient
      const grad = ctx.createLinearGradient(0, 0, width, 0);
      grad.addColorStop(0, '#0b192c');
      grad.addColorStop(0.5, '#1e293b');
      grad.addColorStop(1, '#0e7490'); // Cyan accent
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(0, 0, width, 84, [20, 20, 0, 0]);
      ctx.fill();

      // Top Header Title & Branding
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
      ctx.fillText('CAMPUSVOTE', 28, 40);

      ctx.font = '600 11px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = isPendingVerification ? '#fde68a' : '#38bdf8';
      ctx.fillText(
        isPendingVerification
          ? 'CAMPUSVOTE DIGITAL ID — INSTITUTION NOT INDEPENDENTLY VERIFIED'
          : 'CAMPUSVOTE OFFICIAL DIGITAL VOTER ID',
        28,
        60
      );

      // Status Pill on Header Right
      if (isPendingVerification) {
        ctx.fillStyle = '#78350f'; // Amber dark
        ctx.beginPath();
        ctx.roundRect(width - 310, 24, 290, 36, 18);
        ctx.fill();
        ctx.fillStyle = '#fde68a';
        ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
        ctx.fillText('INSTITUTION NOT INDEPENDENTLY VERIFIED', width - 300, 46);
      } else {
        ctx.fillStyle = '#065f46'; // Emerald dark
        ctx.beginPath();
        ctx.roundRect(width - 210, 24, 182, 36, 18);
        ctx.fill();
        ctx.fillStyle = '#34d399';
        ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
        ctx.fillText('INSTITUTIONALLY VERIFIED', width - 198, 46);
      }

      // Card Body Interior
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(24, 104, width - 48, height - 128, 14);
      ctx.fill();

      // Student Avatar Box
      ctx.fillStyle = '#f1f5f9';
      ctx.beginPath();
      ctx.roundRect(46, 126, 100, 110, 12);
      ctx.fill();
      ctx.strokeStyle = '#cbd5e1';
      ctx.stroke();

      // Avatar Monogram
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
      const initials = (cardData.student_name || 'CV')
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('');
      ctx.fillText(initials, 72, 194);

      // Student Name
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
      ctx.fillText(cardData.student_name, 166, 150);

      // College / Institution Name
      ctx.fillStyle = '#0284c7'; // Brand Cyan/Blue
      ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
      wrapCanvasText(ctx, effectiveCollegeName.toUpperCase(), 166, 172, 380, 16);

      // College ID
      ctx.fillStyle = '#64748b';
      ctx.font = '600 12px system-ui, -apple-system, sans-serif';
      ctx.fillText('COLLEGE ID / ROLL NO:', 166, 202);
      ctx.fillStyle = '#0369a1';
      ctx.font = 'bold 15px monospace';
      ctx.fillText(cardData.college_id, 335, 203);

      // Department & Academic Year
      ctx.fillStyle = '#64748b';
      ctx.font = '600 12px system-ui, -apple-system, sans-serif';
      ctx.fillText('DEPARTMENT:', 166, 226);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
      wrapCanvasText(ctx, `${cardData.department} (Year ${cardData.academic_year} of 5)`, 265, 226, 275, 16);

      // Voter ID Reference Number Highlight Box
      ctx.fillStyle = '#f8fafc';
      ctx.strokeStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.roundRect(46, 264, 440, 68, 10);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#475569';
      ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
      ctx.fillText('UNIQUE VOTER ID REFERENCE NUMBER', 62, 286);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 20px monospace';
      ctx.fillText(cardData.voter_id_number, 62, 316);

      // Issue Date & Status Notice
      ctx.fillStyle = '#64748b';
      ctx.font = '11px system-ui, -apple-system, sans-serif';
      const issueDate = new Date(cardData.issued_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
      const statusLabel = isPendingVerification
        ? 'Status: Pending Institutional Verification'
        : 'Status: Active Registered Collegiate Voter';
      ctx.fillText(`Issued: ${issueDate}  •  ${statusLabel}`, 46, 362);

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'italic 10px system-ui, -apple-system, sans-serif';
      ctx.fillText(
        'Collegiate credential confirming institutional voter identity. Dynamic election eligibility is evaluated separately per ballot rules.',
        46,
        384
      );

      // Draw QR Code Image onto Right Side
      if (qrDataUrl) {
        const qrImg = new Image();
        qrImg.crossOrigin = 'anonymous';
        await new Promise((resolve) => {
          qrImg.onload = resolve;
          qrImg.src = qrDataUrl;
        });

        // QR Container
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(width - 230, 126, 184, 210, 12);
        ctx.fill();
        ctx.stroke();

        ctx.drawImage(qrImg, width - 218, 138, 160, 160);

        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SCAN AT VOTING TERMINAL', width - 138, 320);
        ctx.textAlign = 'left';
      }

      // Trigger Download
      const dataUrl = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = dataUrl;
      downloadLink.download = `CampusVote-VoterID-${cardData.college_id}.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } catch (err) {
      console.error('Failed to generate Voter ID PNG:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const formattedDate = new Date(cardData.issued_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="space-y-4">
      {/* Voter ID Card Display Preview */}
      <div
        ref={cardContainerRef}
        id="campusvote-voter-card-printable"
        className="relative rounded-2xl overflow-hidden border border-slate-700 bg-gradient-to-b from-slate-900 to-navy-950 text-white shadow-2xl max-w-2xl mx-auto p-0.5 print:border-black print:text-black print:bg-white"
      >
        {/* Card Header Bar */}
        <div className="bg-gradient-to-r from-navy-900 via-slate-800 to-cyan-900 p-4 sm:p-5 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-cyan/20 border border-brand-cyan/40 text-brand-cyan flex items-center justify-center shadow-inner">
              <Vote className="w-5 h-5 text-brand-cyan-light" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base sm:text-lg tracking-tight text-white">
                  CAMPUSVOTE
                </h3>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand-cyan/20 text-brand-cyan-light font-semibold border border-brand-cyan/30">
                  DIGITAL CREDENTIAL
                </span>
              </div>
              <p className="text-[11px] text-slate-300 font-medium">
                {isPendingVerification
                  ? 'CampusVote Digital ID — Institution Not Independently Verified'
                  : 'Smart ID Collegiate Voter Credential'}
              </p>
            </div>
          </div>

          {isPendingVerification ? (
            <Badge variant="warning" size="sm" className="hidden sm:inline-flex bg-amber-950/80 text-amber-300 border-amber-600/40">
              <Clock className="w-3.5 h-3.5 mr-1 text-amber-400" />
              Institution Not Independently Verified
            </Badge>
          ) : (
            <Badge variant="success" size="sm" className="hidden sm:inline-flex bg-emerald-950/80 text-emerald-300 border-emerald-600/40">
              <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-400" />
              Verified Roster
            </Badge>
          )}
        </div>

        {/* Card Main Body */}
        <div className="bg-white text-navy-950 p-5 sm:p-6 rounded-b-2xl">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 items-center">
            {/* Left 2 Cols: Student Identity Details */}
            <div className="sm:col-span-2 space-y-3.5">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-300 text-navy-950 flex items-center justify-center font-bold text-xl shadow-xs shrink-0">
                  {(cardData.student_name || 'CV')
                    .split(' ')
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join('')}
                </div>
                <div className="min-w-0">
                  <h4 className="font-extrabold text-lg text-navy-950 leading-tight truncate">
                    {cardData.student_name}
                  </h4>
                  <div className="flex items-center gap-1.5 text-xs text-brand-primary font-semibold mt-0.5">
                    <Building2 className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{effectiveCollegeName}</span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    ID: {cardData.college_id}
                  </p>
                </div>
              </div>

              {/* Department & Academic Details */}
              <div className="grid grid-cols-2 gap-2 text-xs py-2 border-y border-slate-200">
                <div>
                  <span className="text-[11px] text-slate-500 block">Department</span>
                  <span className="font-semibold text-slate-800 break-words">{cardData.department}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Academic Year</span>
                  <span className="font-semibold text-slate-800">Year {cardData.academic_year} of 5</span>
                </div>
              </div>

              {/* Unique Voter ID Reference Box */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">
                    Unique Voter ID Reference
                  </span>
                  <span className="font-mono font-extrabold text-base text-navy-950 tracking-wider">
                    {cardData.voter_id_number}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyVoterId}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-navy-950 hover:bg-slate-200 transition-colors"
                  title="Copy Voter ID Reference"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              {/* Issuance Metadata */}
              <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1">
                <span>Issued: {formattedDate}</span>
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Active Credential
                </span>
              </div>
            </div>

            {/* Right Col: QR Code Box */}
            <div className="sm:col-span-1 flex flex-col items-center justify-center p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`Voter ID QR Code for ${cardData.college_id}`}
                  className="w-36 h-36 rounded-lg border border-slate-200 shadow-2xs bg-white p-1"
                />
              ) : (
                <div className="w-36 h-36 rounded-lg bg-slate-200 animate-pulse flex items-center justify-center">
                  <QrIcon className="w-8 h-8 text-slate-400" />
                </div>
              )}
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mt-2">
                Terminal Scan QR
              </span>
              <span className="text-[9px] text-slate-400">
                Opaque signed token
              </span>
            </div>
          </div>

          {/* Legal / Policy Note */}
          <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-500 leading-relaxed text-center sm:text-left">
            CampusVote collegiate credential. Certifies institutional enrollment and voting registry standing at{' '}
            <span className="font-semibold text-slate-700">{effectiveCollegeName}</span>.
            Election-specific eligibility is evaluated separately per ballot rules. Non-transferable.
          </div>
        </div>
      </div>

      {/* Card Action Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 max-w-2xl mx-auto pt-2">
        <div className="text-xs text-slate-500 font-medium">
          Digital ID Format: Standard ID-1 • Cryptographically Verified
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePrint}
            leftIcon={<Printer className="w-4 h-4" />}
          >
            Print Card
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleDownloadPng}
            isLoading={isDownloading}
            leftIcon={<Download className="w-4 h-4" />}
          >
            Download Voter ID (PNG)
          </Button>
        </div>
      </div>
    </div>
  );
};
