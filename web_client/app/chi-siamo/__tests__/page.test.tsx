import { render } from '@testing-library/react';
import ChiSiamoPage from '@/app/chi-siamo/page';
import { SEED_COMPANY_INFO } from '@/lib/company-info/seed';
import { getCompanyInfo } from '@/lib/company-info/server';

jest.mock('@/lib/company-info/server', () => ({ getCompanyInfo: jest.fn() }));
jest.mock('@/components/sections/Navbar', () => ({ Navbar: () => <nav aria-label="Mock nav" /> }));
jest.mock('@/components/sections/Footer', () => ({ Footer: () => <footer /> }));
jest.mock('@/components/chat/ChatWidget', () => ({ __esModule: true, default: () => null }));

describe('/chi-siamo page scroll & landmark hygiene', () => {
    it('clips horizontal overflow on page wrapper with overflow-x-clip so CSS does not coerce overflow-y to auto', async () => {
        (getCompanyInfo as jest.Mock).mockResolvedValue(SEED_COMPANY_INFO);
        const { container } = render(await ChiSiamoPage());
        const wrapper = container.firstElementChild;
        expect(wrapper).not.toBeNull();
        expect(wrapper).toHaveClass('overflow-x-clip');
        expect(wrapper).not.toHaveClass('overflow-x-hidden');
    });

    it('keeps Navbar and Footer as top-level landmarks outside <main>', async () => {
        (getCompanyInfo as jest.Mock).mockResolvedValue(SEED_COMPANY_INFO);
        const { container } = render(await ChiSiamoPage());
        const main = container.querySelector('main');
        expect(main).not.toBeNull();
        expect(container.querySelector('main nav')).toBeNull();
        expect(container.querySelector('main footer')).toBeNull();
    });

    it('clips ambient-glow in #about with overflow-clip instead of creating a scroll container via overflow-hidden', async () => {
        (getCompanyInfo as jest.Mock).mockResolvedValue(SEED_COMPANY_INFO);
        const { container } = render(await ChiSiamoPage());
        const aboutSection = container.querySelector('section#about');
        expect(aboutSection).not.toBeNull();
        expect(aboutSection).toHaveClass('overflow-clip');
        expect(aboutSection).not.toHaveClass('overflow-hidden');
    });
});
