import { AttributionControl, type Map as MapLibreMap } from 'maplibre-gl';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const originalObjectUrlDescriptor = vi.hoisted(() => {
  const descriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  // The vulnerable v5 baseline creates a worker blob URL on import. jsdom lacks
  // this API; this shim lets the same regression run against both versions.
  // No worker or renderer is started by this test.
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: () => 'blob:local-attribution-test-worker',
  });
  return descriptor;
});

type DataEvent = { type: string; dataType: string; sourceDataType: string };
type Listener = (event: DataEvent) => void;

const normalAttribution = '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';
const customAttribution = '<a href="https://openfreemap.org/" target="_blank">OpenFreeMap</a>';
const markExecuted = "document.body.dataset.attributionExecuted = 'yes'";

// Only the map host is replaced: onAdd and registered sourcedata listeners run
// the shipped AttributionControl, including its real HTML sanitizer and DOM sink.
function createMapHost(attribution: string) {
  const source = { attribution };
  const canvasContainer = document.createElement('div');
  const listeners = new Map<string, Set<Listener>>();
  const host = {
    style: {
      stylesheet: { version: 8, sources: {}, layers: [] },
      tileManagers: {
        local: { used: true, usedForTerrain: false, getSource: () => source },
      },
    },
    _getUIString: () => 'Toggle attribution',
    getCanvasContainer: () => canvasContainer,
    on(type: string, listener: Listener) {
      const registered = listeners.get(type) ?? new Set<Listener>();
      registered.add(listener);
      listeners.set(type, registered);
      return host;
    },
    off(type: string, listener: Listener) {
      listeners.get(type)?.delete(listener);
      return host;
    },
  };

  return {
    map: host as unknown as MapLibreMap,
    updateSourceAttribution(this: void, next: string) {
      source.attribution = next;
      for (const listener of listeners.get('sourcedata') ?? []) {
        listener({ type: 'sourcedata', dataType: 'source', sourceDataType: 'metadata' });
      }
    },
  };
}

const mountedControls: AttributionControl[] = [];

function mountAttribution(attribution: string) {
  const host = createMapHost(attribution);
  const control = new AttributionControl({ compact: false, customAttribution });
  const container = control.onAdd(host.map);
  document.body.append(container);
  mountedControls.push(control);
  return { ...host, container };
}

function expectNormalAttribution(container: HTMLElement) {
  expect(container).toHaveTextContent('© OpenStreetMap');
  expect(container.querySelector('a[href="https://www.openstreetmap.org/copyright"]'))
    .toHaveTextContent('OpenStreetMap');
  expect(container.querySelector('a[href="https://openfreemap.org/"]'))
    .toHaveTextContent('OpenFreeMap');
  expect(container).not.toHaveClass('maplibregl-attrib-empty');
  expect(container).toHaveAttribute('open');
}

afterEach(() => {
  for (const control of mountedControls.splice(0)) control.onRemove();
  document.body.replaceChildren();
  delete document.body.dataset.attributionExecuted;
});

afterAll(() => {
  if (originalObjectUrlDescriptor) {
    Object.defineProperty(URL, 'createObjectURL', originalObjectUrlDescriptor);
  } else {
    Reflect.deleteProperty(URL, 'createObjectURL');
  }
});

describe('MapLibre AttributionControl security', () => {
  it('uses an executable local DOM so event-execution assertions cannot silently pass', () => {
    const button = document.createElement('button');
    button.setAttribute('onmouseover', markExecuted);
    document.body.append(button);
    button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(document.body.dataset.attributionExecuted).toBe('yes');
  });

  it('preserves normal source and custom attribution text and HTTPS links across metadata updates', () => {
    const { container, updateSourceAttribution } = mountAttribution(normalAttribution);
    expectNormalAttribution(container);
    updateSourceAttribution(`${normalAttribution} · Local map data`);
    expectNormalAttribution(container);
    expect(container).toHaveTextContent('Local map data');
  });

  for (const path of ['onAdd', 'source metadata update'] as const) {
    it.each([
      ['adjacent event attributes', `<span onclick="${markExecuted}" onmouseover="${markExecuted}">Local provider</span>`],
      ['an unsafe URL adjacent to an event attribute', `<a onclick="${markExecuted}" href="javascript:void(0)" onmouseover="${markExecuted}">Local provider</a>`],
    ])(`removes %s through ${path} without executing handlers or losing safe attribution`, (_name, maliciousAttribution) => {
      const attribution = `${normalAttribution} · ${maliciousAttribution}`;
      const { container, updateSourceAttribution } = mountAttribution(path === 'onAdd' ? attribution : normalAttribution);
      if (path === 'source metadata update') updateSourceAttribution(attribution);

      expectNormalAttribution(container);
      expect(container).toHaveTextContent('Local provider');
      for (const element of Array.from(container.querySelectorAll('span, a')).filter((element) => element.textContent === 'Local provider')) {
        element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      }
      expect(document.body.dataset.attributionExecuted).toBeUndefined();
      expect(container.querySelector('[onclick], [onmouseover], [href^="javascript:"], [href^="data:"]')).toBeNull();
    });
  }
});
