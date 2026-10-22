import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UploadCloud,
  Download,
  ArrowLeft,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Info,
  Check,
} from 'lucide-react';
import { Sidebar } from '../../components/layout/Sidebar';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog';
import {
  ImportSession,
  ImportRow,
  ImportCommitResult,
} from '../../types/student';
import {
  previewRosterCsv,
  commitRosterImport,
  downloadRosterTemplate,
} from '../../services/students';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const RosterImportPage: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload & Preview states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [importSession, setImportSession] = useState<ImportSession | null>(null);

  // Strategy & Commit states
  const [strategy, setStrategy] = useState<'skip_conflicts' | 'update_conflicts'>('skip_conflicts');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  // Filter preview rows by status
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const processSelectedFile = (file: File) => {
    setUploadError(null);
    setCommitResult(null);
    setCommitError(null);

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setUploadError('Only CSV (.csv) files are permitted for roster ingestion.');
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadError(`File exceeds maximum permitted size of 5MB (${(file.size / (1024 * 1024)).toFixed(2)} MB uploaded).`);
      return;
    }
    setSelectedFile(file);
  };

  const handleUploadAndPreview = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      const session = await previewRosterCsv(selectedFile);
      setImportSession(session);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to parse and preview CSV.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCommit = async () => {
    if (!importSession) return;
    setIsCommitting(true);
    setCommitError(null);
    try {
      const result = await commitRosterImport(importSession.id, strategy);
      setCommitResult(result);
      setIsConfirmOpen(false);
    } catch (err: any) {
      setCommitError(err.message || 'Failed to commit roster import.');
      setIsConfirmOpen(false);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setImportSession(null);
    setCommitResult(null);
    setUploadError(null);
    setCommitError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Preview filtering
  const previewRows: ImportRow[] = importSession?.preview_data || [];
  const filteredRows = previewRows.filter((row) => {
    if (statusFilter === 'ALL') return true;
    return row.status === statusFilter;
  });

  return (
    <div className="flex-1 flex flex-col md:flex-row min-h-screen bg-surface-subtle/30">
      <Sidebar portalType="admin" />

      <div className="flex-1 pb-16">
        <PageHeader
          title="CSV Student Roster Import"
          description="Safely ingest official institutional registrar rolls with pre-commit validation, duplicate detection, and demographic diff preview."
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/admin/students')}
                leftIcon={<ArrowLeft className="w-4 h-4" />}
              >
                Back to Registry
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={downloadRosterTemplate}
                leftIcon={<Download className="w-4 h-4 text-brand-primary" />}
              >
                Download CSV Template
              </Button>
            </div>
          }
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          {/* Commit Success State */}
          {commitResult ? (
            <Card className="border-emerald-300 bg-emerald-50/40">
              <CardContent className="p-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-navy-950">Roster Import Committed Successfully</h3>
                <p className="text-sm text-slate-600 max-w-lg mx-auto">
                  {commitResult.message}
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl mx-auto py-4">
                  <div className="p-3 bg-white rounded-xl border border-surface-border text-center">
                    <p className="text-xs text-slate-500 font-medium">Created</p>
                    <p className="text-2xl font-bold text-emerald-600">{commitResult.created_count}</p>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-surface-border text-center">
                    <p className="text-xs text-slate-500 font-medium">Updated</p>
                    <p className="text-2xl font-bold text-blue-600">{commitResult.updated_count}</p>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-surface-border text-center">
                    <p className="text-xs text-slate-500 font-medium">Skipped</p>
                    <p className="text-2xl font-bold text-slate-500">{commitResult.skipped_count}</p>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-surface-border text-center">
                    <p className="text-xs text-slate-500 font-medium">Total Processed</p>
                    <p className="text-2xl font-bold text-navy-950">{commitResult.total_processed}</p>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-3 pt-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => navigate('/admin/students')}
                  >
                    View Updated Student Registry
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReset}
                  >
                    Import Another File
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Step 1: Upload Card (If no preview session yet) */}
              {!importSession && (
                <Card>
                  <CardContent className="p-6 space-y-6">
                    <div>
                      <h3 className="text-base font-bold text-navy-950 flex items-center gap-2">
                        <FileSpreadsheet className="w-5 h-5 text-brand-primary" />
                        Step 1: Select Registrar CSV File
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        Upload an authorized UTF-8 CSV containing student enrollment data. Expected columns:
                        <code className="mx-1 px-1.5 py-0.5 rounded bg-surface-subtle font-mono text-[11px] text-navy-950 font-bold">
                          college_id,full_name,email,department,academic_year,course
                        </code>
                      </p>
                    </div>

                    {uploadError && (
                      <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                        <span>{uploadError}</span>
                      </div>
                    )}

                    {/* Drag and Drop Box */}
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragOver(true);
                      }}
                      onDragLeave={() => setIsDragOver(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
                        isDragOver
                          ? 'border-brand-primary bg-blue-50/50'
                          : selectedFile
                          ? 'border-emerald-400 bg-emerald-50/20'
                          : 'border-slate-300 hover:border-slate-400 bg-surface-subtle/40'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,text/csv"
                        onChange={handleFileChange}
                        className="hidden"
                      />

                      <div className="w-12 h-12 rounded-full bg-white shadow-subtle border border-surface-border text-brand-primary flex items-center justify-center mx-auto mb-3">
                        <UploadCloud className="w-6 h-6" />
                      </div>

                      {selectedFile ? (
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-navy-950">{selectedFile.name}</p>
                          <p className="text-xs text-slate-500">
                            {(selectedFile.size / 1024).toFixed(1)} KB — Ready to analyze
                          </p>
                          <p className="text-[11px] text-brand-primary font-medium pt-1">
                            Click or drag to choose a different file
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-navy-950">
                            Click to select or drag and drop your CSV file here
                          </p>
                          <p className="text-xs text-slate-500">
                            Maximum upload size: 5 MB. Formats: .csv (UTF-8, UTF-8 with BOM, Latin-1)
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Info className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>Previewing does not modify the student database.</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {selectedFile && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleReset}
                            disabled={isUploading}
                          >
                            Clear
                          </Button>
                        )}
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleUploadAndPreview}
                          disabled={!selectedFile || isUploading}
                          isLoading={isUploading}
                          leftIcon={<UploadCloud className="w-4 h-4" />}
                        >
                          Upload & Validate Preview
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Step 2 & 3: Preview and Review Session */}
              {importSession && (
                <div className="space-y-6">
                  {commitError && (
                    <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                      <span>{commitError}</span>
                    </div>
                  )}

                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="p-4 rounded-xl bg-white border border-surface-border">
                      <p className="text-[11px] text-slate-500 font-medium">Total Rows</p>
                      <p className="text-xl font-bold text-navy-950">{importSession.total_rows}</p>
                    </div>

                    <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200">
                      <p className="text-[11px] text-emerald-800 font-medium flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Valid New
                      </p>
                      <p className="text-xl font-bold text-emerald-700">{importSession.valid_rows}</p>
                    </div>

                    <div className="p-4 rounded-xl bg-red-50/70 border border-red-200">
                      <p className="text-[11px] text-red-800 font-medium flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" /> Invalid
                      </p>
                      <p className="text-xl font-bold text-red-700">{importSession.invalid_rows}</p>
                    </div>

                    <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-200">
                      <p className="text-[11px] text-purple-800 font-medium flex items-center gap-1">
                        <Copy className="w-3.5 h-3.5" /> Duplicates
                      </p>
                      <p className="text-xl font-bold text-purple-700">{importSession.duplicate_rows}</p>
                    </div>

                    <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200">
                      <p className="text-[11px] text-amber-800 font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Conflicts
                      </p>
                      <p className="text-xl font-bold text-amber-700">{importSession.conflict_rows}</p>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-100 border border-slate-200">
                      <p className="text-[11px] text-slate-600 font-medium flex items-center gap-1">
                        <Info className="w-3.5 h-3.5" /> Identical
                      </p>
                      <p className="text-xl font-bold text-slate-700">{importSession.identical_rows}</p>
                    </div>
                  </div>

                  {/* Conflict Resolution & Actions Banner */}
                  <div className="bg-white p-4 rounded-2xl border border-surface-border shadow-subtle flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-navy-950">Conflict Resolution Strategy</p>
                      <div className="flex items-center gap-4 text-xs">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="strategy"
                            value="skip_conflicts"
                            checked={strategy === 'skip_conflicts'}
                            onChange={() => setStrategy('skip_conflicts')}
                            className="text-brand-primary focus:ring-brand-primary"
                          />
                          <span className="text-slate-700">Skip Conflicting Records (Safe)</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="strategy"
                            value="update_conflicts"
                            checked={strategy === 'update_conflicts'}
                            onChange={() => setStrategy('update_conflicts')}
                            className="text-brand-primary focus:ring-brand-primary"
                          />
                          <span className="text-slate-700">Update Existing Records with CSV Data</span>
                        </label>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={handleReset} disabled={isCommitting}>
                        Cancel & Discard
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setIsConfirmOpen(true)}
                        disabled={
                          isCommitting ||
                          (importSession.valid_rows === 0 &&
                            (strategy === 'skip_conflicts' || importSession.conflict_rows === 0))
                        }
                        isLoading={isCommitting}
                        leftIcon={<CheckCircle2 className="w-4 h-4" />}
                      >
                        Commit Roster Ingestion
                      </Button>
                    </div>
                  </div>

                  {/* Preview Table Header and Filter */}
                  <div className="bg-white rounded-2xl border border-surface-border shadow-subtle overflow-hidden">
                    <div className="p-4 border-b border-surface-border flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-navy-950">
                          Pre-Commit Row Validation Preview
                        </h4>
                        <p className="text-xs text-slate-500">
                          File: <span className="font-mono text-slate-700 font-semibold">{importSession.filename}</span>{' '}
                          ({(importSession.file_size_bytes / 1024).toFixed(1)} KB)
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-slate-500 font-medium mr-1">Filter Rows:</span>
                        {['ALL', 'VALID', 'INVALID', 'CONFLICT', 'DUPLICATE', 'IDENTICAL'].map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => setStatusFilter(st)}
                            className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                              statusFilter === st
                                ? 'bg-navy-950 text-white'
                                : 'bg-surface-subtle text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="overflow-x-auto max-h-[500px]">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="sticky top-0 bg-surface-subtle border-b border-surface-border text-slate-500 font-semibold uppercase tracking-wider z-10">
                          <tr>
                            <th className="py-2.5 px-3">Row #</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">College ID</th>
                            <th className="py-2.5 px-3">Full Name</th>
                            <th className="py-2.5 px-3">Email</th>
                            <th className="py-2.5 px-3">Dept</th>
                            <th className="py-2.5 px-3">Year</th>
                            <th className="py-2.5 px-3">Program</th>
                            <th className="py-2.5 px-3">Validation Details & Diff</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-border/60 text-navy-950 font-normal">
                          {filteredRows.map((row) => (
                            <tr
                              key={row.row_number}
                              className={`hover:bg-surface-subtle/50 transition-colors ${
                                row.status === 'INVALID'
                                  ? 'bg-red-50/30'
                                  : row.status === 'CONFLICT'
                                  ? 'bg-amber-50/30'
                                  : row.status === 'DUPLICATE'
                                  ? 'bg-purple-50/30'
                                  : ''
                              }`}
                            >
                              <td className="py-2.5 px-3 font-mono text-slate-500">{row.row_number}</td>
                              <td className="py-2.5 px-3">
                                <Badge
                                  variant={
                                    row.status === 'VALID'
                                      ? 'success'
                                      : row.status === 'INVALID'
                                      ? 'danger'
                                      : row.status === 'CONFLICT'
                                      ? 'warning'
                                      : 'neutral'
                                  }
                                  size="sm"
                                >
                                  {row.status}
                                </Badge>
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold">{row.college_id}</td>
                              <td className="py-2.5 px-3 font-medium">{row.full_name}</td>
                              <td className="py-2.5 px-3 text-slate-500">{row.email || '—'}</td>
                              <td className="py-2.5 px-3 font-semibold text-slate-700">{row.department}</td>
                              <td className="py-2.5 px-3">
                                {row.academic_year ? `Year ${row.academic_year}` : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 truncate max-w-[120px]">
                                {row.course || '—'}
                              </td>
                              <td className="py-2.5 px-3 text-[11px]">
                                {row.errors && row.errors.length > 0 && (
                                  <ul className="text-red-600 list-disc list-inside space-y-0.5">
                                    {row.errors.map((err, i) => (
                                      <li key={i}>{err}</li>
                                    ))}
                                  </ul>
                                )}
                                {row.diff && Object.keys(row.diff).length > 0 && (
                                  <div className="text-amber-800 space-y-0.5">
                                    {Object.entries(row.diff).map(([field, delta]) => (
                                      <div key={field}>
                                        <span className="font-semibold">{field}:</span>{' '}
                                        <span className="line-through text-slate-400">{String(delta.old)}</span> ➔{' '}
                                        <span className="font-bold text-amber-900">{String(delta.new)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {row.status === 'IDENTICAL' && (
                                  <span className="text-slate-400 italic">Matches existing database record exactly</span>
                                )}
                                {row.status === 'VALID' && row.errors.length === 0 && (
                                  <span className="text-emerald-600 font-medium">Ready for creation</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Confirmation Dialog before Commit */}
      <ConfirmationDialog
        isOpen={isConfirmOpen}
        title="Commit Roster Ingestion"
        description={`Are you sure you want to commit this roster import session? ${
          importSession?.valid_rows || 0
        } new student records will be created${
          strategy === 'update_conflicts' && (importSession?.conflict_rows || 0) > 0
            ? ` and ${importSession?.conflict_rows} conflicting records will be updated`
            : ''
        }. This operation uses server-side transactional safety.`}
        confirmLabel="Confirm & Commit Import"
        cancelLabel="Cancel"
        variant="primary"
        isLoading={isCommitting}
        onConfirm={handleCommit}
        onClose={() => setIsConfirmOpen(false)}
      />
    </div>
  );
};
