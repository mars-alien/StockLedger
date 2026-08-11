import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCategoryOptions } from '../../api/categories';
import { errorMessage } from '../../api/client';
import { useProducts } from '../../api/products';
import { PageHeader } from '../../components/layout/PageHeader';
import { EmptyState } from '../../components/shared/EmptyState';
import { ErrorState } from '../../components/shared/ErrorState';
import { TableSkeleton } from '../../components/shared/Loader';
import { Pagination } from '../../components/shared/Pagination';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Input, Select } from '../../components/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableRow } from '../../components/ui/Table';
import { useCanEditCatalog } from '../../hooks/usePermissions';
import { useAuthStore } from '../../store/authStore';
import { ProductFormModal } from './ProductFormModal';

export function ProductsPage() {
  const organizationId = useAuthStore((state) => state.organization?.id);
  const canEdit = useCanEditCatalog();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [isActive, setIsActive] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const categories = useCategoryOptions({ organizationId });
  const products = useProducts({ organizationId, page, search, categoryId, isActive });

  const changeFilter = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Everything you sell, and the variants under each one."
        action={canEdit && <Button onClick={() => setFormOpen(true)}>New product</Button>}
      />

      <Card>
        <CardHeader
          title="Catalog"
          action={
            <div className="flex flex-wrap gap-2">
              <Input
                aria-label="Search products"
                placeholder="Search name or SKU"
                className="max-w-48"
                value={search}
                onChange={changeFilter(setSearch)}
              />
              <Select
                aria-label="Filter by category"
                className="max-w-40"
                value={categoryId}
                onChange={changeFilter(setCategoryId)}
              >
                <option value="">All categories</option>
                {(categories.data ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Filter by status"
                className="max-w-32"
                value={isActive}
                onChange={changeFilter(setIsActive)}
              >
                <option value="">Any status</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </Select>
            </div>
          }
        />

        {products.isPending && <TableSkeleton columns={5} />}

        {products.isError && (
          <ErrorState
            message={errorMessage(products.error, 'Products did not load')}
            onRetry={products.refetch}
          />
        )}

        {products.isSuccess && products.data.data.length === 0 && (
          <EmptyState
            title="Nothing matches"
            description="Adjust the filters, or add your first product."
            action={canEdit && <Button onClick={() => setFormOpen(true)}>New product</Button>}
          />
        )}

        {products.isSuccess && products.data.data.length > 0 && (
          <>
            <Table>
              <TableHead
                columns={[
                  'Product',
                  'SKU',
                  'Category',
                  { label: 'Variants', align: 'right' },
                  'Status',
                ]}
              />
              <TableBody>
                {products.data.data.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <Link
                        to={`/products/${product.id}`}
                        className="font-medium text-indigo-700 hover:underline"
                      >
                        {product.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{product.sku}</TableCell>
                    <TableCell>{product.category?.name ?? '—'}</TableCell>
                    <TableCell align="right">{product._count.variants}</TableCell>
                    <TableCell>
                      <Badge tone={product.isActive ? 'indigo' : 'slate'}>
                        {product.isActive ? 'active' : 'inactive'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Pagination
              page={products.data.page}
              totalPages={products.data.totalPages}
              total={products.data.total}
              onChange={setPage}
            />
          </>
        )}
      </Card>

      <ProductFormModal
        open={formOpen}
        organizationId={organizationId}
        product={null}
        onClose={() => setFormOpen(false)}
      />
    </div>
  );
}
