import { NextResponse } from "next/server";

const schema = {
  openapi: "3.1.0",
  info: {
    title: "SMURFX API",
    version: "1.0.0",
    description: "API principal de catalogo, autenticacion, carrito y operaciones SMURFX.",
  },
  servers: [{ url: "/api" }],
  paths: {
    "/auth/register": {
      post: {
        summary: "Registrar usuario",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string" },
                  password: { type: "string" },
                  firstName: { type: "string" },
                  lastName: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Sesion creada" } },
      },
    },
    "/auth/login": {
      post: {
        summary: "Iniciar sesion",
        responses: { "200": { description: "Sesion iniciada" } },
      },
    },
    "/auth/session": {
      get: {
        summary: "Leer sesion actual",
        responses: { "200": { description: "Usuario autenticado o null" } },
      },
    },
    "/cart": {
      get: {
        summary: "Obtener carrito actual",
        responses: { "200": { description: "Carrito actual" } },
      },
    },
    "/cart/items": {
      post: {
        summary: "Agregar item al carrito",
        responses: { "200": { description: "Carrito actualizado" } },
      },
      patch: {
        summary: "Actualizar cantidad",
        responses: { "200": { description: "Carrito actualizado" } },
      },
      delete: {
        summary: "Eliminar item del carrito",
        responses: { "200": { description: "Carrito actualizado" } },
      },
    },
  },
};

export async function GET() {
  return NextResponse.json(schema);
}
