export type AnomalyType =
  | 'TURNOUT_VELOCITY_SPIKE'
  | 'ELEVATED_DUPLICATE_VOTE_RATE'
  | 'ELEVATED_AUTH_FAILURE_RATE'
  | 'DATA_INTEGRITY_VIOLATION'
  | 'ML_MULTIVARIATE_ANOMALY';

export type DetectorType = 'RULE_BASED' | 'MACHINE_LEARNING';

export type AnomalySeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type AnomalyStatus =
  | 'OPEN'
  | 'ACKNOWLEDGED'
  | 'INVESTIGATING'
  | 'RESOLVED'
  | 'FALSE_POSITIVE';

export interface AnomalyAlert {
  id: string;
  election: string;
  anomaly_type: AnomalyType;
  detector_type: DetectorType;
  severity: AnomalySeverity;
  risk_score: number;
  explanation: string;
  evidence_summary: Record<string, any>;
  recommended_actions: string;
  status: AnomalyStatus;
  detected_at: string;
  model_version: string;
  reviewed_by: string | null;
  reviewed_by_email: string | null;
  reviewed_at: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnomalySummaryMetrics {
  total_alerts: number;
  open_alerts: number;
  acknowledged_alerts: number;
  investigating_alerts: number;
  resolved_alerts: number;
  false_positive_alerts: number;
  critical_severity_count: number;
  high_severity_count: number;
  last_detection_run: string;
  detector_status: string;
}

export interface RunPipelineResponse {
  message: string;
  new_alerts_detected: number;
  alerts: AnomalyAlert[];
}
