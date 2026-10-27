import { describe, it, expect, vi } from 'vitest';
import ReactDOMServer from 'react-dom/server';

vi.mock('konva', () => ({ default: {} }));
vi.mock('react-konva', () => ({
  Stage: (props: any) => <div>{props.children}</div>,
  Layer: (props: any) => <div>{props.children}</div>,
  Image: () => null,
  Rect: () => null,
  Circle: () => null,
  Arrow: () => null,
  Line: () => null,
  Text: () => null,
  Group: (props: any) => <div>{props.children}</div>,
  Transformer: () => null,
}));

import { App } from '../App';
import { ProjectLibrary } from '../components/dashboard/ProjectLibrary';
import { StudioLayout } from '../components/studio/StudioLayout';
import { StudioHeader } from '../components/studio/StudioHeader';
import { StepOutline } from '../components/studio/StepOutline';
import { CenterViewport } from '../components/studio/CenterViewport';
import { StepInspector } from '../components/studio/StepInspector';
import { CoverPageStudio } from '../components/studio/CoverPageStudio';
import { TableOfContentsStudio } from '../components/studio/TableOfContentsStudio';
import { FloatingDot } from '../components/overlay/FloatingDot';
import { ErrorBoundary } from '../components/common/ErrorBoundary';

describe('Component Render & Hook Invariants', () => {
  it('renders ErrorBoundary', () => {
    const html = ReactDOMServer.renderToString(
      <ErrorBoundary>
        <div>Test Child</div>
      </ErrorBoundary>
    );
    expect(html).toContain('Test Child');
  });

  it('renders ProjectLibrary without hook violations', () => {
    expect(() => {
      ReactDOMServer.renderToString(<ProjectLibrary />);
    }).not.toThrow();
  });

  it('renders StudioLayout without hook violations', () => {
    expect(() => {
      ReactDOMServer.renderToString(<StudioLayout />);
    }).not.toThrow();
  });

  it('renders StudioHeader without hook violations', () => {
    expect(() => {
      ReactDOMServer.renderToString(<StudioHeader />);
    }).not.toThrow();
  });

  it('renders StepOutline without hook violations', () => {
    expect(() => {
      ReactDOMServer.renderToString(<StepOutline />);
    }).not.toThrow();
  });

  it('renders CenterViewport without hook violations', () => {
    expect(() => {
      ReactDOMServer.renderToString(<CenterViewport />);
    }).not.toThrow();
  });

  it('renders StepInspector without hook violations', () => {
    expect(() => {
      ReactDOMServer.renderToString(<StepInspector />);
    }).not.toThrow();
  });

  it('renders CoverPageStudio without hook violations', () => {
    expect(() => {
      ReactDOMServer.renderToString(<CoverPageStudio />);
    }).not.toThrow();
  });

  it('renders TableOfContentsStudio without hook violations', () => {
    expect(() => {
      ReactDOMServer.renderToString(<TableOfContentsStudio />);
    }).not.toThrow();
  });

  it('renders FloatingDot without hook violations', () => {
    expect(() => {
      ReactDOMServer.renderToString(<FloatingDot />);
    }).not.toThrow();
  });

  it('renders App without hook violations', () => {
    expect(() => {
      ReactDOMServer.renderToString(<App />);
    }).not.toThrow();
  });
});
