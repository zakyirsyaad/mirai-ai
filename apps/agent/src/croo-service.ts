import {
  OrderRequirementsSchema,
  ServiceType,
  type Env,
} from "@mirai/shared";

export function resolveCrooService(args: {
  serviceId: string;
  requirements: unknown;
  env: Pick<
    Env,
    "CROO_SERVICE_CONTENT_AGENT_7D_ID" | "CROO_SERVICE_VOICE_IDEAS_ID"
  >;
}): ServiceType | undefined {
  const byServiceId = serviceByCrooId(args.serviceId, args.env);
  if (byServiceId) return byServiceId;

  const parsed = OrderRequirementsSchema.safeParse(args.requirements);
  return parsed.success ? parsed.data.service : undefined;
}

function serviceByCrooId(
  serviceId: string,
  env: Pick<
    Env,
    "CROO_SERVICE_CONTENT_AGENT_7D_ID" | "CROO_SERVICE_VOICE_IDEAS_ID"
  >,
): ServiceType | undefined {
  if (serviceId === env.CROO_SERVICE_CONTENT_AGENT_7D_ID) {
    return ServiceType.ContentAgent7d;
  }
  if (serviceId === env.CROO_SERVICE_VOICE_IDEAS_ID) {
    return ServiceType.VoiceIdeas;
  }
  return undefined;
}
