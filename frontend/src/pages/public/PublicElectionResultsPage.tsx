import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Award,
  Vote,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Info,
  Copy,
  Check,
  ShieldCheck
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { PublicElectionResult, PositionResultItem, CandidateTallyItem } from '../../types/results';
import { getPublicElectionResults } from '../../services/results';

export const PublicElectionResultsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [results, setResults] = useState<PublicElectionResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedDigest, setCopiedDigest] = useState(false);

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    setError(null);

    getPublicElectionResults(id)
      .then((data) => setResults(data))
      .catch((err) => {
        // Safe user-friendly message
        if (err.status === 404) {
          setResults(null);
        } else {
          setError(err.message || 'Failed to load official results.');
        }
      })
      .finally(() => setIsLoading(false));
  }, [id]);

  const copyDigest = () => {
    if (!results?.result_digest) return;
    navigator.clipboard.writeText(results.result_digest);
    setCopiedDigest(true);
    setTimeout(() => setCopiedDigest(false), 2500);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <LoadingState message="Loading official election results..." />
      </div>
    );
  }

  const positionsList: PositionResultItem[] =
    results?.position_results || results?.positions || [];

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Top Banner & Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center gap-2 mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/elections')}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
            >
              All Elections
            </Button>
          </div>

          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  OFFICIAL PUBLISHED RESULTS
                </span>
                {results?.is_synthetic && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    SYNTHETIC DEMONSTRATION DATA
                  </span>
                )}
                {results?.academic_year && (
                  <span className="text-xs font-mono text-slate-500 font-semibold">
                    {results.academic_year}
                  </span>
                )}
              </div>

              <h1 className="text-3xl font-black text-slate-900 tracking-tight">
                {results?.election_title || 'Election Results'}
              </h1>
              <p className="text-sm text-slate-600 mt-1 max-w-2xl">
                Certified aggregate vote outcomes calculated deterministically using the CampusVote privacy-preserving election protocol.
              </p>
            </div>

            {results?.published_at && (
              <div className="text-right">
                <span className="text-xs font-bold uppercase text-slate-400 block">Published On</span>
                <span className="text-sm font-semibold text-slate-700">
                  {new Date(results.published_at).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {/* Error Notification */}
        {error && (
          <div className="mb-8 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-3 shadow-sm">
            <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm font-semibold">{error}</div>
          </div>
        )}

        {/* Synthetic Demo Warning */}
        {results?.is_synthetic && (
          <div className="mb-8 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3 shadow-sm">
            <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <span className="font-bold">Synthetic Demonstration Election: </span>
              These published results were computed from isolated demonstration fixtures for verification testing.
              No real student identity or official balloting was recorded.
            </div>
          </div>
        )}

        {/* Not Published or Not Found State */}
        {!results ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
            <EmptyState
              icon={<Award className="w-16 h-16 text-slate-300 mx-auto" />}
              title="Official Results Not Yet Published"
              description="Official vote tallies have not yet been approved and certified for public release for this election cycle. Please check back after polls close and governance certification is complete."
              action={
                <Button variant="primary" onClick={() => navigate('/elections')}>
                  Browse Other Elections
                </Button>
              }
            />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Aggregate Overview Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="border border-slate-200 shadow-sm">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="p-3 bg-blue-50 text-brand-primary rounded-xl">
                    <Vote className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs font-bold uppercase text-slate-400">Total Ballots Cast</span>
                    <h3 className="text-2xl font-black text-slate-900">{results.total_ballots_tallied}</h3>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-slate-200 shadow-sm">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                    <Award className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs font-bold uppercase text-slate-400">Positions Contested</span>
                    <h3 className="text-2xl font-black text-slate-900">{results.total_positions_tallied}</h3>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-slate-200 shadow-sm">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="p-3 bg-slate-100 text-slate-700 rounded-xl">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-bold uppercase text-slate-400">Cryptographic Digest</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono text-xs text-slate-800 truncate" title={results.result_digest}>
                        {results.result_digest.slice(0, 16)}...
                      </span>
                      <button
                        onClick={copyDigest}
                        className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-800 transition-colors"
                        title="Copy SHA-256 Digest"
                      >
                        {copiedDigest ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Position Cards */}
            <div className="space-y-6">
              {positionsList.map((pos) => {
                const candidates: CandidateTallyItem[] = pos.candidates || pos.candidate_tallies || [];

                return (
                  <Card key={pos.position_id} className="border border-slate-200 shadow-sm overflow-hidden">
                    <CardHeader className="bg-slate-50/80 border-b border-slate-200 p-5 flex flex-row items-center justify-between flex-wrap gap-2">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">{pos.position_title}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Total Votes Cast: <span className="font-bold text-slate-800">{pos.total_votes_cast}</span> | Abstentions: <span className="font-bold text-slate-800">{pos.abstention_count}</span>
                        </p>
                      </div>

                      <div>
                        {pos.is_tied ? (
                          <Badge variant="warning" size="sm">
                            TIE DETECTED
                          </Badge>
                        ) : pos.winner_candidate_name ? (
                          <Badge variant="success" size="sm">
                            ELECTED: {pos.winner_candidate_name}
                          </Badge>
                        ) : (
                          <Badge variant="neutral" size="sm">NO VOTES</Badge>
                        )}
                      </div>
                    </CardHeader>

                    {pos.is_tied && (
                      <div className="bg-amber-50 border-b border-amber-200 px-5 py-3 text-xs text-amber-900 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <span>
                          <strong className="font-bold">Tie Status: </strong>
                          Multiple candidates tied for first place. Institutional runoff or tie-breaking bylaws apply.
                        </span>
                      </div>
                    )}

                    <CardContent className="p-0">
                      <div className="divide-y divide-slate-100">
                        {candidates.map((cand) => (
                          <div
                            key={cand.candidate_id}
                            className={`p-5 flex items-center justify-between gap-4 flex-wrap hover:bg-slate-50/60 transition-colors ${
                              cand.is_winner ? 'bg-emerald-50/30' : cand.is_tied ? 'bg-amber-50/30' : ''
                            }`}
                          >
                            <div className="flex items-center gap-4">
                              <span
                                className={`w-8 h-8 rounded-full flex items-center justify-center font-mono font-bold text-sm ${
                                  cand.rank === 1
                                    ? 'bg-amber-100 text-amber-900'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                #{cand.rank}
                              </span>
                              <div>
                                <h4 className="font-bold text-base text-slate-900">{cand.candidate_name}</h4>
                                <span className="text-xs text-slate-500">
                                  {cand.is_winner && (
                                    <span className="text-emerald-700 font-semibold">Official Winner</span>
                                  )}
                                  {cand.is_tied && (
                                    <span className="text-amber-700 font-semibold">Tied for #1</span>
                                  )}
                                  {!cand.is_winner && !cand.is_tied && 'Candidate'}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-6 min-w-[240px]">
                              <div className="flex-1">
                                <div className="flex justify-between text-xs font-mono font-bold text-slate-700 mb-1">
                                  <span>{cand.vote_count} votes</span>
                                  <span>{cand.vote_percentage}%</span>
                                </div>
                                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-700 ${
                                      cand.is_winner
                                        ? 'bg-emerald-500'
                                        : cand.is_tied
                                        ? 'bg-amber-500'
                                        : 'bg-brand-primary'
                                    }`}
                                    style={{ width: `${Math.min(cand.vote_percentage, 100)}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicElectionResultsPage;
