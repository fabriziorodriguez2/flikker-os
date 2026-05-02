import {
  CanActivate,
  Injectable,
  NotFoundException,
  Type,
  mixin,
} from '@nestjs/common';
import { API_FEATURES, type ApiFeatureName } from '../../config/features';

export function FeatureFlagGuard(flag: ApiFeatureName): Type<CanActivate> {
  @Injectable()
  class FeatureFlagMixinGuard implements CanActivate {
    canActivate(): boolean {
      if (!API_FEATURES[flag]) {
        throw new NotFoundException('Feature not available');
      }

      return true;
    }
  }

  return mixin(FeatureFlagMixinGuard);
}
