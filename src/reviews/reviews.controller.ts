import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import type {
  DismissReviewPromptInput,
  SubmitOrderReviewInput,
} from './reviews.types';

@Controller('commerce/reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  private identity(guestId?: string, customerToken?: string) {
    return {
      guestId: guestId ?? '',
      customerToken,
    };
  }

  @Get('pending')
  pending(
    @Headers('x-maaniko-guest-id') guestId?: string,
    @Headers('x-maaniko-customer-token') customerToken?: string,
  ) {
    return this.reviews.pendingPrompt(
      this.identity(guestId, customerToken),
    );
  }

  @Post()
  submit(
    @Body() body: SubmitOrderReviewInput,
    @Headers('x-maaniko-guest-id') guestId?: string,
    @Headers('x-maaniko-customer-token') customerToken?: string,
  ) {
    return this.reviews.submit(
      this.identity(guestId, customerToken),
      body,
    );
  }

  @Post('dismiss')
  dismiss(
    @Body() body: DismissReviewPromptInput,
    @Headers('x-maaniko-guest-id') guestId?: string,
    @Headers('x-maaniko-customer-token') customerToken?: string,
  ) {
    return this.reviews.dismiss(
      this.identity(guestId, customerToken),
      body,
    );
  }

  @Get('products/:productId')
  productReviews(
    @Param('productId') productId: string,
    @Query('limit') limit?: string,
  ) {
    return this.reviews.forProduct(productId, limit);
  }

  @Get('combos/:comboId')
  comboReviews(
    @Param('comboId') comboId: string,
    @Query('limit') limit?: string,
  ) {
    return this.reviews.forCombo(comboId, limit);
  }
}
