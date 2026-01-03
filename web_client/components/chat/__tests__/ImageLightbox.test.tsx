import { render, screen, fireEvent } from '@testing-library/react';
import { ImageLightbox } from '../ImageLightbox';

describe('ImageLightbox', () => {
    const defaultProps = {
        imageUrl: 'https://example.com/image.jpg',
        onClose: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should not render when imageUrl is null', () => {
        const { container } = render(<ImageLightbox imageUrl={null} onClose={jest.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('should render image when imageUrl is provided', () => {
        render(<ImageLightbox {...defaultProps} />);

        const image = screen.getByAltText(/rendering/i);
        expect(image).toBeInTheDocument();
        expect(image).toHaveAttribute('src', defaultProps.imageUrl);
    });

    it('should call onClose when close button clicked', () => {
        render(<ImageLightbox {...defaultProps} />);

        const closeButton = screen.getByRole('button', { name: /chiudi/i });
        fireEvent.click(closeButton);

        expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when backdrop is clicked', () => {
        render(<ImageLightbox {...defaultProps} />);

        // Click on the backdrop (the outer div)
        const backdrop = screen.getByRole('dialog');
        fireEvent.click(backdrop);

        expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it('should have download link with correct href', () => {
        render(<ImageLightbox {...defaultProps} />);

        const downloadLink = screen.getByRole('link', { name: /scarica/i });
        expect(downloadLink).toBeInTheDocument();
        expect(downloadLink).toHaveAttribute('href', defaultProps.imageUrl);
        expect(downloadLink).toHaveAttribute('download');
    });

    it('should not close when clicking on image', () => {
        render(<ImageLightbox {...defaultProps} />);

        const image = screen.getByAltText(/rendering/i);
        fireEvent.click(image);

        // Should not call onClose
        expect(defaultProps.onClose).not.toHaveBeenCalled();
    });
});
