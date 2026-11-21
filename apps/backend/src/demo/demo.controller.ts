import { Body, Controller, Post } from '@nestjs/common';
import { EchoDto } from './echo.dto.js';

// Demo route for trying the global ValidationPipe and exception filter. Remove it together with
// EchoDto once the real endpoints exist.
@Controller('demo')
export class DemoController {
  @Post('echo')
  echo(@Body() body: EchoDto): EchoDto {
    return body;
  }
}
