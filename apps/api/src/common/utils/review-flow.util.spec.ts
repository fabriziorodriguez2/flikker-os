import { ReviewFlowMode } from '@prisma/client';
import { canUseDirectGoogle, resolveReviewFlow } from './review-flow.util';

describe('resolveReviewFlow', () => {
  it('prefiere defaultReviewRedirectUrl sobre googleBusinessProfileUrl', () => {
    const result = resolveReviewFlow({
      reviewFlowMode: ReviewFlowMode.PRIVATE_FEEDBACK,
      defaultReviewRedirectUrl: 'https://g.page/r/real-review-link',
      googleBusinessProfileUrl: 'https://maps.google.com/otro',
    });
    expect(result.googleReviewUrl).toBe('https://g.page/r/real-review-link');
  });

  it('sin defaultReviewRedirectUrl: cae a googleBusinessProfileUrl', () => {
    const result = resolveReviewFlow({
      reviewFlowMode: ReviewFlowMode.DIRECT_GOOGLE,
      defaultReviewRedirectUrl: null,
      googleBusinessProfileUrl: 'https://maps.google.com/otro',
    });
    expect(result.googleReviewUrl).toBe('https://maps.google.com/otro');
  });

  it('sin ninguna de las dos: null, nunca se fabrica una URL', () => {
    const result = resolveReviewFlow({
      reviewFlowMode: ReviewFlowMode.PRIVATE_FEEDBACK,
      defaultReviewRedirectUrl: null,
      googleBusinessProfileUrl: null,
    });
    expect(result.googleReviewUrl).toBeNull();
  });

  it('devuelve el mode tal cual, nunca lo deriva de nada', () => {
    expect(
      resolveReviewFlow({
        reviewFlowMode: ReviewFlowMode.DIRECT_GOOGLE,
        defaultReviewRedirectUrl: 'https://g.page/r/x',
        googleBusinessProfileUrl: null,
      }).mode,
    ).toBe(ReviewFlowMode.DIRECT_GOOGLE);
  });
});

describe('canUseDirectGoogle', () => {
  it('true si hay defaultReviewRedirectUrl', () => {
    expect(
      canUseDirectGoogle({
        defaultReviewRedirectUrl: 'https://g.page/r/x',
        googleBusinessProfileUrl: null,
      }),
    ).toBe(true);
  });

  it('true si hay googleBusinessProfileUrl aunque falte defaultReviewRedirectUrl', () => {
    expect(
      canUseDirectGoogle({
        defaultReviewRedirectUrl: null,
        googleBusinessProfileUrl: 'https://maps.google.com/x',
      }),
    ).toBe(true);
  });

  it('false sin ninguna de las dos — nunca se activa DIRECT_GOOGLE sin destino real', () => {
    expect(
      canUseDirectGoogle({
        defaultReviewRedirectUrl: null,
        googleBusinessProfileUrl: null,
      }),
    ).toBe(false);
  });
});
