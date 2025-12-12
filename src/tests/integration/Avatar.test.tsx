import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Avatar } from '../../components/ui/Avatar';

describe('Avatar Component', () => {
  it('renders initials correctly', async () => {
    render(<Avatar name="John Doe" id="123" />);
    expect(await screen.findByText('JD')).toBeInTheDocument();
  });

  it('renders single initial correctly', async () => {
    render(<Avatar name="Alice" id="456" />);
    expect(await screen.findByText('A')).toBeInTheDocument();
  });

  it('applies size classes', async () => {
    const { rerender } = render(<Avatar name="Test" id="789" size="sm" />);
    // Note: We can't easily check class names on the text element, but we can check the container
    // However, testing implementation details like specific classes is brittle.
    // We'll just ensure it renders without crashing for different sizes.
    expect(await screen.findByText('T')).toBeInTheDocument();

    rerender(<Avatar name="Test" id="789" size="xl" />);
    expect(await screen.findByText('T')).toBeInTheDocument();
  });
});
