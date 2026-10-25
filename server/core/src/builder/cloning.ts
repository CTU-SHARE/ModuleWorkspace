import { z } from 'zod';
import { builder, route, identifier, title } from './base.js';
import { exportPackage, installPackage } from './packages.js';
builder.post(
  '/apps/:id/clone',
  route(async (q, s, c) => {
    const b = z.object({ name: title }).parse(q.body);
    const source = await exportPackage(c, identifier.parse(q.params.id));
    s.status(201).json(await installPackage(c, source, b.name));
  }),
);
