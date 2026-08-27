import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { demoMode } from './app/core/demo/demo-mode';

async function bootstrap(): Promise<void> {
  const providers = [...appConfig.providers];

  // Loaded dynamically so the mock dataset lands in its own chunk and a
  // normal build never ships it. demoMode is already false unless this
  // build allows demo mode AND the tab asked for it.
  if (demoMode) {
    const { installDemoMode } = await import('./app/core/demo/demo-providers');
    providers.push(...installDemoMode());
  }

  await bootstrapApplication(AppComponent, { ...appConfig, providers });
}

bootstrap().catch((err) => console.error(err));
