/**
 * report-ready — gate funcional Fase 6 do delivery-loop.
 * Live no preview Vercel: IA real, CNPJ Scheffer, auth Supabase.
 * Sem gate de qualidade (PORTA, golden, socio-search metrics).
 *
 * Uso (local — exige secrets em env, nunca em arquivo):
 *   BASE_URL=https://...preview.vercel.app \
 *   E2E_REAL_AUTH=1 \
 *   E2E_OPERATOR_EMAIL=bruno.ferreira@senior.com.br \
 *   E2E_AUTH_PASSWORD=*** \
 *   E2E_DEPLOYMENT_SHA=<sha40> \
 *   npm run test:e2e:report-ready
 *
 * CI: secrets GOLDEN_E2E_OPERATOR_EMAIL + GOLDEN_E2E_AUTH_PASSWORD mapeados para E2E_*.
 */
import { test } from '@playwright/test';
import {
  assertServedDeploymentSha,
  REPORT_READY_SETUP_MARGIN_MS,
  REPORT_READY_TIMEOUT_MS,
  requireReportReadyEnvironment,
  runReportReadyFlow,
  setupReportReadyAuth,
} from './helpers/report-ready';

test.describe('report-ready — dossiê live no preview', () => {
  test.describe.configure({ timeout: REPORT_READY_TIMEOUT_MS + REPORT_READY_SETUP_MARGIN_MS });

  test.beforeAll(() => {
    if (!process.env.BASE_URL?.startsWith('https://')) {
      throw new Error('Defina BASE_URL=https://...preview.vercel.app antes de rodar report-ready live');
    }
    if (process.env.E2E_REAL_AUTH !== '1') {
      throw new Error('Defina E2E_REAL_AUTH=1 para o gate live');
    }
    if (!process.env.E2E_AUTH_PASSWORD) {
      throw new Error('Defina E2E_AUTH_PASSWORD (ou GOLDEN_E2E_AUTH_PASSWORD no CI)');
    }
  });

  test('Scheffer — dossiê gerado (funcional, sem qualidade)', async ({ page, request }, testInfo) => {
    const traceMilestones: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[TRACE]')) {
        traceMilestones.push(text);
        console.log(text);
      }
    });

    const env = requireReportReadyEnvironment(testInfo);

    try {
      await setupReportReadyAuth(page, env.operatorEmail);

      if (env.deploymentSha) {
        await assertServedDeploymentSha(request, page, env.deploymentSha);
      }

      const { cnpj, textLength } = await runReportReadyFlow(page, `report-ready ${Date.now()}`);

      await testInfo.attach('trace-milestones', {
        body: Buffer.from(traceMilestones.join('\n') || '(nenhum [TRACE] capturado)'),
        contentType: 'text/plain',
      });

      console.log('\n✅ report-ready OK', {
        cnpj,
        textLength,
        previewUrl: env.baseURL,
        deploymentSha: env.deploymentSha ?? '(não verificado)',
      });
    } catch (error) {
      await testInfo.attach('trace-milestones', {
        body: Buffer.from(traceMilestones.join('\n') || '(nenhum [TRACE] capturado)'),
        contentType: 'text/plain',
      });
      throw error;
    }
  });
});
