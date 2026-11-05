import { S3Service } from '../../../services/s3.service';
import { GetPresignedUploadUrlHandler } from './get-presigned-upload-url.handler';
import { GetPresignedUploadUrlQuery } from './get-presigned-upload-url.query';

describe('GetPresignedUploadUrlHandler', () => {
  it('pide la URL firmada al almacenamiento con la tienda, el nombre y el tipo del archivo', async () => {
    const result = { uploadUrl: 'https://bucket/up', fileUrl: 'https://cdn/f.png' };
    const getUploadPresignedUrl = jest.fn(() => Promise.resolve(result));
    const handler = new GetPresignedUploadUrlHandler({ getUploadPresignedUrl } as unknown as S3Service);

    await expect(handler.execute(new GetPresignedUploadUrlQuery('t1', 'foto.png', 'image/png'))).resolves.toBe(result);
    expect(getUploadPresignedUrl).toHaveBeenCalledWith('t1', 'foto.png', 'image/png');
  });

  it('el rechazo de un tipo no permitido llega tal cual al cliente', async () => {
    const rejection = Object.assign(new Error('tipo'), { code: 'UNSUPPORTED_MEDIA_TYPE' });
    const handler = new GetPresignedUploadUrlHandler({ getUploadPresignedUrl: () => Promise.reject(rejection) } as unknown as S3Service);

    await expect(handler.execute(new GetPresignedUploadUrlQuery('t1', 'virus.exe', 'application/x-msdownload'))).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
  });
});
