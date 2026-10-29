import type { ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { store } from '../store/index.js';

/** Render UI wrapped in the app's Redux + Router providers, at a given route. */
export function renderWithProviders(ui: ReactNode, { route = '/' }: { route?: string } = {}, options?: RenderOptions) {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </Provider>,
    options,
  );
}
