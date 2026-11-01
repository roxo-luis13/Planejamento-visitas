/**
 * ID do cliente OAuth do Google (Google Cloud → Credenciais → "Aplicativo da Web").
 * NÃO é secreto: é feito para ficar dentro de sites. Usado para o login com Google
 * e para guardar os dados no Google Drive do usuário.
 */
const ID_CLIENTE = '602248457617-li1i4q94jd1r1fhqlv2rtgu83oajkan3.apps.googleusercontent.com';

// (VITE_GOOGLE_CLIENT_ID só é usado nos testes automáticos)
export const GOOGLE_CLIENT_ID: string = ID_CLIENTE.trim() || (import.meta.env?.VITE_GOOGLE_CLIENT_ID ?? '');

/**
 * Chave da API do Google Maps (Routes API + Places API (New)). Vazia = recurso desligado:
 * o app usa a estimativa em linha reta e o OpenStreetMap, sem custo.
 * Só preencher depois de travar as cotas diárias no Google Cloud (ver README).
 */
const CHAVE_MAPS = '';
export const chaveMaps = (cfg?: { googleKey?: string } | null): string => CHAVE_MAPS.trim() || cfg?.googleKey || '';
