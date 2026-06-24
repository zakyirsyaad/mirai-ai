import {
  hostedActivate,
  hostedAddContentItems,
  hostedConnectX,
  hostedCreateCampaign,
  hostedGenerateVoiceIdeas,
  hostedGetCampaign,
  hostedGetReport,
  hostedHealthcheck,
  hostedPauseAutopost,
  hostedResumeAutopost,
  hostedSetContentPolicy,
  hostedSetVoiceProfile,
  hostedStartAutopost,
} from "./hosted-client.js";

export type ContentMode = "AUTONOMOUS" | "USER_SUPPLIED";

export interface VoiceProfilePayload {
  tone: string;
  topics: string[];
  styleNotes: string[];
  doNots: string[];
  sampleVoice: string;
}

export interface ContentPolicyPayload {
  allowedTopics?: string[];
  blockedTopics?: string[];
  blockedPhrases?: string[];
  language?: "any" | "id" | "en" | "mixed";
  toneRules?: string[];
  formatRules?: string[];
  requireApprovalFor?: string[];
}

export async function activateLicense(licenseKey: string): Promise<unknown> {
  return hostedActivate(licenseKey);
}

export async function healthcheck(): Promise<unknown> {
  return hostedHealthcheck();
}

export async function connectX(): Promise<unknown> {
  return hostedConnectX();
}

export async function createCampaign(args: {
  contentMode?: ContentMode;
  niche?: string;
  audience?: string;
  goal?: string;
  toneHint?: string;
  contentPolicy?: ContentPolicyPayload;
}): Promise<unknown> {
  return hostedCreateCampaign(args);
}

export async function setVoiceProfile(profile: VoiceProfilePayload): Promise<unknown> {
  return hostedSetVoiceProfile(profile);
}

export async function setContentPolicy(policy: ContentPolicyPayload): Promise<unknown> {
  return hostedSetContentPolicy(policy);
}

export async function addContentItems(items: string[]): Promise<unknown> {
  return hostedAddContentItems(items);
}

export async function startAutopost(approved: boolean): Promise<unknown> {
  return hostedStartAutopost(approved);
}

export async function pauseAutopost(): Promise<unknown> {
  return hostedPauseAutopost();
}

export async function resumeAutopost(): Promise<unknown> {
  return hostedResumeAutopost();
}

export async function getCampaign(): Promise<unknown> {
  return hostedGetCampaign();
}

export async function getReport(): Promise<unknown> {
  return hostedGetReport();
}

export async function generateVoiceIdeas(): Promise<unknown> {
  return hostedGenerateVoiceIdeas();
}
