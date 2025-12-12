import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Icon } from '../../components/ui/Icon';

describe('Icon Component', () => {
  it('renders known icon correctly', async () => {
    const { container } = render(<Icon name="mic" />);
    // Wait for the SVG to appear
    const svg = await screen.findByText((content, element) => {
      return element?.tagName.toLowerCase() === 'svg';
    });
    expect(svg).toBeInTheDocument();
  });

  it('renders nothing for unknown icon', () => {
    const { container } = render(<Icon name="unknown-icon-name" />);
    expect(container.innerHTML).toBe('');
  });

  it('applies custom size', async () => {
    const { container } = render(<Icon name="mic" size={48} />);
    // Use querySelector directly on container, but maybe wait?
    // Let's use findBy first to ensure render is done
    await screen.findByText((content, element) => element?.tagName.toLowerCase() === 'svg');
    
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '48');
    expect(svg).toHaveAttribute('height', '48');
  });
});

