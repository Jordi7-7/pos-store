import { NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { S3Service } from '../services/s3.service';
import { DeleteImageCommand } from './commands/delete-image/delete-image.command';
import { DeleteImageHandler } from './commands/delete-image/delete-image.handler';
import { RegisterImageCommand } from './commands/register-image/register-image.command';
import { RegisterImageHandler } from './commands/register-image/register-image.handler';

describe('Handlers de media', () => {
  const findOne = jest.fn();
  const save = jest.fn();
  const remove = jest.fn();
  const getRawOne = jest.fn();
  const qb = { select: () => qb, from: () => qb, where: () => qb, limit: () => qb, getRawOne };
  const manager = {
    getRepository: () => ({ findOne, save, remove }),
    createQueryBuilder: () => qb,
  } as unknown as EntityManager;

  const assertBelongsToTenant = jest.fn();
  const belongsToTenant = jest.fn();
  const deleteFile = jest.fn();
  const s3 = {
    assertBelongsToTenant,
    belongsToTenant,
    deleteFile,
    cleanUrl: (url: string) => url.split('?')[0],
  } as unknown as S3Service;

  beforeEach(() => {
    jest.resetAllMocks();
    save.mockImplementation((image: object) => Promise.resolve({ id: 'i1', ...image }));
  });

  describe('RegisterImageHandler', () => {
    it('registra la imagen con la URL limpia si pertenece al tenant', async () => {
      const image = await new RegisterImageHandler(manager, s3).execute(new RegisterImageCommand('t1', 'https://cdn/t1/a.jpg?sig=1', 'foto'));

      expect(assertBelongsToTenant).toHaveBeenCalledWith('t1', 'https://cdn/t1/a.jpg?sig=1');
      expect(image).toMatchObject({ tenantId: 't1', url: 'https://cdn/t1/a.jpg', description: 'foto' });
    });

    it('no guarda nada si el archivo es de otro tenant', async () => {
      assertBelongsToTenant.mockImplementation(() => {
        throw new AppException(ErrorCode.MediaNotOwned, 'ajeno', 403);
      });

      await expect(new RegisterImageHandler(manager, s3).execute(new RegisterImageCommand('t1', 'https://cdn/t2/a.jpg'))).rejects.toThrow(AppException);
      expect(save).not.toHaveBeenCalled();
    });
  });

  describe('DeleteImageHandler', () => {
    const handler = () => new DeleteImageHandler(manager, s3);

    it('devuelve 404 si la imagen no es del tenant', async () => {
      findOne.mockResolvedValue(null);
      await expect(handler().execute(new DeleteImageCommand('t1', 'i1'))).rejects.toThrow(NotFoundException);
    });

    it('no borra una imagen asignada a un producto (MEDIA_IN_USE) ni toca el bucket', async () => {
      findOne.mockResolvedValue({ id: 'i1', url: 'u' });
      getRawOne.mockResolvedValueOnce({ '?column?': 1 });

      await expect(handler().execute(new DeleteImageCommand('t1', 'i1'))).rejects.toMatchObject({ code: ErrorCode.MediaInUse });
      expect(deleteFile).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    });

    it('borra archivo y registro cuando está libre y es del tenant', async () => {
      findOne.mockResolvedValue({ id: 'i1', url: 'u' });
      getRawOne.mockResolvedValue(undefined);
      belongsToTenant.mockReturnValue(true);

      await expect(handler().execute(new DeleteImageCommand('t1', 'i1'))).resolves.toMatchObject({ success: true });
      expect(deleteFile).toHaveBeenCalledWith('u');
      expect(remove).toHaveBeenCalled();
    });

    it('si la URL apunta fuera del tenant elimina solo el registro', async () => {
      findOne.mockResolvedValue({ id: 'i1', url: 'u' });
      getRawOne.mockResolvedValue(undefined);
      belongsToTenant.mockReturnValue(false);

      await handler().execute(new DeleteImageCommand('t1', 'i1'));
      expect(deleteFile).not.toHaveBeenCalled();
      expect(remove).toHaveBeenCalled();
    });
  });
});
