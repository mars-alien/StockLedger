import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { useStockMovements } from '../../api/inventory';
import {
  useDeleteVariant,
  useProduct,
  useUpdateProduct,
  useUploadProductImage,
} from '../../api/products';
import { PageHeader } from '../../components/layout/PageHeader';
import { EmptyState } from '../../components/shared/EmptyState';
import { ErrorBanner } from '../../components/shared/ErrorBanner';
import { ErrorState } from '../../components/shared/ErrorState';
import { Loader, TableSkeleton } from '../../components/shared/Loader';
import { Pagination } from '../../components/shared/Pagination';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableRow } from '../../components/ui/Table';
import { useCanEditCatalog } from '../../hooks/usePermissions';
import { useAuthStore } from '../../store/authStore';
import { formatDateTime } from '../../utils/datetime';
import { formatPaise } from '../../utils/money';
import { ProductFormModal } from './ProductFormModal';
import { VariantFormModal } from './VariantFormModal';

export function ProductDetailPage() {
  const { productId } = useParams();
  const organizationId = useAuthStore((state) => state.organization?.id);
  const canEdit = useCanEditCatalog();
  const fileInput = useRef(null);

  const [historyPage, setHistoryPage] = useState(1);
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [variantFormOpen, setVariantFormOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState(null);

  const product = useProduct({ organizationId, productId });
  const history = useStockMovements({ organizationId, productId, page: historyPage });
  const uploadImage = useUploadProductImage(organizationId);
  const updateProduct = useUpdateProduct(organizationId);
  const deleteVariant = useDeleteVariant(organizationId);

  if (product.isPending) {
    return <Loader label="Loading product" />;
  }

  if (product.isError) {
    return (
      <ErrorState
        message={errorMessage(product.error, 'That product could not be loaded')}
        onRetry={product.refetch}
      />
    );
  }

  const item = product.data;
  const actionError = uploadImage.error ?? updateProduct.error ?? deleteVariant.error;

  const openVariantForm = (variant) => {
    setEditingVariant(variant);
    setVariantFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <Link to="/products" className="text-sm text-indigo-700 hover:underline">
          Back to products
        </Link>
      </div>

      <PageHeader
        title={item.name}
        description={`${item.sku} · ${item.category?.name ?? 'No category'}`}
        action={
          canEdit && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setProductFormOpen(true)}>
                Edit
              </Button>
              <Button
                variant="secondary"
                disabled={updateProduct.isPending}
                onClick={() =>
                  updateProduct.mutate({ productId: item.id, isActive: !item.isActive })
                }
              >
                {item.isActive ? 'Deactivate' : 'Activate'}
              </Button>
              <Button onClick={() => openVariantForm(null)}>Add variant</Button>
            </div>
          )
        }
      />

      {actionError && <ErrorBanner>{errorMessage(actionError, 'That did not work')}</ErrorBanner>}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Image" />
          <div className="space-y-3 px-5 py-4">
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.name}
                className="aspect-square w-full rounded-md object-cover ring-1 ring-slate-200"
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-md bg-slate-100 text-sm text-slate-500">
                No image
              </div>
            )}

            {canEdit && (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      uploadImage.mutate({ productId: item.id, file });
                    }
                    event.target.value = '';
                  }}
                />
                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={uploadImage.isPending}
                  onClick={() => fileInput.current?.click()}
                >
                  {uploadImage.isPending ? 'Uploading' : 'Upload image'}
                </Button>
                <p className="text-xs text-slate-500">JPEG, PNG or WebP, up to 2 MB.</p>
              </>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Variants"
            description={item.description || 'No description yet.'}
            action={
              <Badge tone={item.isActive ? 'indigo' : 'slate'}>
                {item.isActive ? 'active' : 'inactive'}
              </Badge>
            }
          />

          {item.variants.length === 0 ? (
            <EmptyState
              title="No variants yet"
              description="A product needs at least one variant before stock can move."
              action={canEdit && <Button onClick={() => openVariantForm(null)}>Add variant</Button>}
            />
          ) : (
            <Table>
              <TableHead
                columns={[
                  'Variant',
                  'SKU',
                  { label: 'Price', align: 'right' },
                  { label: 'In stock', align: 'right' },
                  '',
                ]}
              />
              <TableBody>
                {item.variants.map((variant) => (
                  <TableRow key={variant.id}>
                    <TableCell className="font-medium text-slate-900">{variant.name}</TableCell>
                    <TableCell className="font-mono text-xs">{variant.sku}</TableCell>
                    <TableCell align="right">{formatPaise(variant.priceCents)}</TableCell>
                    <TableCell align="right">{variant.quantityOnHand}</TableCell>
                    <TableCell className="text-right">
                      {canEdit && (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openVariantForm(variant)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={deleteVariant.isPending}
                            onClick={() =>
                              deleteVariant.mutate({ productId: item.id, variantId: variant.id })
                            }
                          >
                            Delete
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Stock history"
          description="Every movement across this product, newest first."
        />

        {history.isPending && <TableSkeleton columns={5} />}

        {history.isError && (
          <ErrorState
            message={errorMessage(history.error, 'History did not load')}
            onRetry={history.refetch}
          />
        )}

        {history.isSuccess && history.data.data.length === 0 && (
          <EmptyState
            title="No movements yet"
            description="Receive stock from the Inventory page to start the ledger."
          />
        )}

        {history.isSuccess && history.data.data.length > 0 && (
          <>
            <Table>
              <TableHead
                columns={[
                  'When',
                  'Variant',
                  'Reason',
                  { label: 'Change', align: 'right' },
                  { label: 'Balance after', align: 'right' },
                ]}
              />
              <TableBody>
                {history.data.data.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell className="text-xs">{formatDateTime(movement.createdAt)}</TableCell>
                    <TableCell>{movement.variant.name}</TableCell>
                    <TableCell>
                      <Badge tone={movement.delta > 0 ? 'indigo' : 'amber'}>
                        {movement.reason.toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell
                      align="right"
                      className={movement.delta > 0 ? 'text-slate-700' : 'text-amber-700'}
                    >
                      {movement.delta > 0 ? `+${movement.delta}` : movement.delta}
                    </TableCell>
                    <TableCell align="right" className="font-medium text-slate-900">
                      {movement.balanceAfter}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Pagination
              page={history.data.page}
              totalPages={history.data.totalPages}
              total={history.data.total}
              onChange={setHistoryPage}
            />
          </>
        )}
      </Card>

      <ProductFormModal
        open={productFormOpen}
        organizationId={organizationId}
        product={item}
        onClose={() => setProductFormOpen(false)}
      />
      <VariantFormModal
        open={variantFormOpen}
        organizationId={organizationId}
        productId={item.id}
        variant={editingVariant}
        onClose={() => setVariantFormOpen(false)}
      />
    </div>
  );
}
