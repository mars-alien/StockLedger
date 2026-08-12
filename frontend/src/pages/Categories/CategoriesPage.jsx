import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { useCategories, useDeleteCategory } from '../../api/categories';
import { PageHeader } from '../../components/layout/PageHeader';
import { EmptyState } from '../../components/shared/EmptyState';
import { ErrorBanner } from '../../components/shared/ErrorBanner';
import { ErrorState } from '../../components/shared/ErrorState';
import { TableSkeleton } from '../../components/shared/Loader';
import { Pagination } from '../../components/shared/Pagination';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableRow } from '../../components/ui/Table';
import { useCanEditCatalog } from '../../hooks/usePermissions';
import { useAuthStore } from '../../store/authStore';
import { CategoryFormModal } from './CategoryFormModal';

export function CategoriesPage() {
  const organizationId = useAuthStore((state) => state.organization?.id);
  const canEdit = useCanEditCatalog();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);

  const categories = useCategories({ organizationId, page, search });
  const remove = useDeleteCategory(organizationId);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (category) => {
    setEditing(category);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        description="How the catalog is grouped."
        action={canEdit && <Button onClick={openCreate}>New category</Button>}
      />

      {remove.isError && (
        <ErrorBanner>{errorMessage(remove.error, 'Could not delete that category')}</ErrorBanner>
      )}

      <Card>
        <CardHeader
          title="All categories"
          action={
            <Input
              aria-label="Search categories"
              placeholder="Search by name"
              className="w-full sm:max-w-56"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          }
        />

        {categories.isPending && <TableSkeleton columns={3} />}

        {categories.isError && (
          <ErrorState
            message={errorMessage(categories.error, 'Categories did not load')}
            onRetry={categories.refetch}
          />
        )}

        {categories.isSuccess && categories.data.data.length === 0 && (
          <EmptyState
            title="No categories yet"
            description="Categories make the product list easier to filter."
            action={canEdit && <Button onClick={openCreate}>New category</Button>}
          />
        )}

        {categories.isSuccess && categories.data.data.length > 0 && (
          <>
            <Table>
              <TableHead columns={['Name', 'Slug', '']} />
              <TableBody>
                {categories.data.data.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell className="font-medium text-slate-900">{category.name}</TableCell>
                    <TableCell className="font-mono text-xs">{category.slug}</TableCell>
                    <TableCell className="text-right">
                      {canEdit && (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(category)}>
                            Rename
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={remove.isPending}
                            onClick={() => remove.mutate(category.id)}
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

            <Pagination
              page={categories.data.page}
              totalPages={categories.data.totalPages}
              total={categories.data.total}
              onChange={setPage}
            />
          </>
        )}
      </Card>

      <CategoryFormModal
        open={formOpen}
        organizationId={organizationId}
        category={editing}
        onClose={() => setFormOpen(false)}
      />
    </div>
  );
}
