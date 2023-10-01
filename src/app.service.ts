import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return '__craftscript__v_1_0_1';
  }
}
