export interface HealthResponse extends Record<string, unknown> {
  status: "ok";
  service: "alpha-hunter";
}

export function getHealth(): HealthResponse {
  return {
    status: "ok",
    service: "alpha-hunter",
  };
}
