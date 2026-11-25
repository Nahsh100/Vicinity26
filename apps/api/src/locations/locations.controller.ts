import { Controller, Get, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Public } from '../common/auth';
import { ZQuery } from '../common/zod';
import { findPlaces, nearestPlace } from './places';

const placesQuery = z.object({ q: z.string().max(80).default(''), limit: z.coerce.number().int().min(1).max(30).default(8) });
const reverseQuery = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) });

@ApiTags('locations')
@Controller('locations')
export class LocationsController {
  /** Neighbourhoods and towns for manual location selection (works without GPS). */
  @Public()
  @Get('places')
  places(@ZQuery(placesQuery) q: z.output<typeof placesQuery>) {
    return findPlaces(q.q, q.limit);
  }

  /** Labels a GPS position with the nearest known neighbourhood or town. */
  @Public()
  @Get('reverse')
  reverse(@ZQuery(reverseQuery) q: z.output<typeof reverseQuery>) {
    return nearestPlace(q.lat, q.lng);
  }
}

@Module({ controllers: [LocationsController] })
export class LocationsModule {}
