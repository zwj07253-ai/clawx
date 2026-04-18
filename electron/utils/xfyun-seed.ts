/**
 * Pre-seed iFlytek (讯飞星辰) provider config on first launch.
 * Employees get a working provider out of the box without manual setup.
 *
 * Guarded by the 'hasSeededXfyun' setting so it only runs once per install.
 */
import { getSetting, setSetting } from './store';
import { saveProviderKeyToOpenClaw, setOpenClawDefaultModelWithOverride } from './openclaw-auth';
import { saveProviderAccount, setDefaultProviderAccount } from '../services/providers/provider-store';
import { setProviderSecret } from '../services/secrets/secret-store';
import { logger } from './logger';

const XFYUN_ACCOUNT_ID = 'xfyun-maas-default';
const XFYUN_API_KEY = '11d0d8d4107018217477be3582fa5fbb:NDdhOGUyYjIwYWQ1NDgzYzNkZjYwNGMw';
const XFYUN_BASE_URL = 'https://maas-coding-api.cn-huabei-1.xf-yun.com/v2';
const XFYUN_MODEL = 'astron-code-latest';
// openclaw.json provider key: custom-${accountId.replace(/-/g,'').slice(0,8)} → custom-xfyunmaa
const XFYUN_OCK = 'custom-xfyunmaa';

export async function seedXfyunProviderIfNeeded(): Promise<void> {
  try {
    const alreadySeeded = await getSetting('hasSeededXfyun' as never);
    if (alreadySeeded) return;

    const now = new Date().toISOString();

    // 1. Save provider account to clawx-providers.json
    await saveProviderAccount({
      id: XFYUN_ACCOUNT_ID,
      vendorId: 'custom',
      label: '讯飞星辰 MaaS',
      authMode: 'api_key',
      baseUrl: XFYUN_BASE_URL,
      apiProtocol: 'openai-completions',
      model: XFYUN_MODEL,
      enabled: true,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });

    // 2. Save API key to secret store (providerSecrets takes priority over apiKeys)
    await setProviderSecret({
      type: 'api_key',
      accountId: XFYUN_ACCOUNT_ID,
      apiKey: XFYUN_API_KEY,
    });

    // 3. Set as default account
    await setDefaultProviderAccount(XFYUN_ACCOUNT_ID);

    // 4. Write key + config into openclaw.json so the gateway picks it up immediately
    await saveProviderKeyToOpenClaw(XFYUN_OCK, XFYUN_API_KEY);
    await setOpenClawDefaultModelWithOverride(XFYUN_OCK, `${XFYUN_OCK}/${XFYUN_MODEL}`, {
      baseUrl: XFYUN_BASE_URL,
      api: 'openai-completions',
    });

    await setSetting('hasSeededXfyun' as never, true as never);
    logger.info('Seeded iFlytek (讯飞星辰) provider config');
  } catch (err) {
    logger.warn('Failed to seed iFlytek provider:', err);
  }
}
